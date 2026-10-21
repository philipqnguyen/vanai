"""Painter for Moonmere's Banded Cloisters module library (numpy + Pillow, no fonts,
no downloaded images). Writes into client/public/models/moonmere-cloister/:

  mc_facade.jpg          the one facade sheet (moonmere_cloister_atlas.py layout), JPEG q90 4:4:4
  mc_facade_night.png    1024 x 1024 emissive: lamplit panes, lamp cores, the cards' windows;
                         the Long Tower's sealed louvres BLACK (MM-1, MM-7: the one dark top room)
  mc_facade_rough.png    256 x 256 roughness in G (stone 0.9, timber 0.7, glass 0.12, glaze 0.35)
  mc_facade.json         the layout and the facade merge's (identity) UV transforms, plus the
                         painter's MEASURED region means (re-read from the encoded JPEG), which
                         client/test/moonmere_modules.test.mjs holds the wash rules to
  pave_soil_{diff,nor}.jpg   512 x 512, one 2 m tile (makePath tex), the gardens' worked soil

    python3 tools/assets/paint_moonmere_cloister_textures.py [out dir]

STYLE (the mock-up's review, "streets dark and heavy", "bands read as noise"): the tufa is
painted LIGHT and QUIET at street scale -- 0.5 m courses with soft beds, low joint
contrast, broad warm clouds, almost no fine speckle -- because the bands are MODELLED
basalt courses on the bays and must read as ruled lines against a calm wall. Every
tiling period is a whole number of pixels and every blur wraps. Deterministic: fixed
seeds, no clocks.
"""
import sys, os, math, json, hashlib, io
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import moonmere_cloister_atlas as A

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(ROOT, 'client/public/models/moonmere-cloister'))
W, H = A.SIZE


def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


PAL = {
    # the tufa at the LIGHTEST wash (pale straw): every wash multiplies it darker
    'tufa': hexc('#EBD7A8'), 'mortar': hexc('#E9DFC9'),
    # MOONMERE.md section 5: the basalt is painted BLUER than its target, mean about
    # sRGB (86, 102, 128), so a warm wash (B >= 0.80) leaves it blue-grey. Review 2026-10-06:
    # it read near-navy at street level ("dark heavy streets" partly survived), so it is a
    # step lighter and a little greyer; the wash test still holds its b - r
    'basalt': hexc('#5E6C86'), 'pale': hexc('#E4D6B2'), 'lime': hexc('#EFE7D6'),
    # the glass is painted blue enough that the warmest wash (x 1.03 / 0.97 jitter) leaves it
    # b >= r (MOONMERE.md: no pane turns orange)
    'walnut': hexc('#5E4130'), 'glass': hexc('#223246'), 'lamp': hexc('#FFC46E'),
    'oak': hexc('#7A5636'), 'leaf': hexc('#4E7A3A'), 'lemon': hexc('#E8C547'),
    # the pantile at the lightest firing: a light, slightly cool grey-lilac, so the four
    # glazes (smoke-violet, plum, slate-teal, ash) are all reachable by multiplying
    # MEASURED (cloister-v1 aerial, iteration 1): the lighter firing #CFC8D8 rendered smoke-
    # violet roofs at sRGB (140, 128, 164) against the contract's target (84, 76, 110): x0.6
    # LOOK PASS M2 (2026-10-06, "every pitched roof the same plum; plum and smoke-violet
    # indistinguishable"): the old base was itself lilac (#7E7A86), so every glaze landed in
    # violet. The firing is now a NEUTRAL warm grey -- the glaze multiplier alone sets the hue.
    'tile': hexc('#85827E'), 'tile_hi': hexc('#C2BFBA'),
    'shutgreen': hexc('#93A497'),
}
LINEAR = lambda c: np.where(c <= 0.04045 * 255, c / 255 / 12.92, ((c / 255 + 0.055) / 1.055) ** 2.4)
SRGB = lambda l: np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(np.maximum(l, 0), 1 / 2.4) - 0.055) * 255


# ------------------------------------------------------------------ noise
def cloud(h, w, cell, seed, octaves=3):
    """Tileable value noise in [-1, 1]: random grids upscaled bicubically with wrap."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        c = max(2, cell >> o)
        gh, gw = max(2, round(h / c)), max(2, round(w / c))
        g = rng.random((gh, gw)).astype(np.float32)
        big = np.tile(g, (3, 3))
        im = Image.fromarray(big).resize((gw * 3 * c, gh * 3 * c), Image.BICUBIC)
        a = np.asarray(im)[gh * c: gh * c + h, gw * c: gw * c + w]
        if a.shape != (h, w):
            a = np.asarray(Image.fromarray(a).resize((w, h), Image.BILINEAR))
        acc += (a - .5) * 2 * amp; tot += amp; amp *= .5
    return acc / tot


def wrapblur(a, r):
    if r <= 0: return a
    k = int(r * 3) + 1
    wts = np.exp(-(np.arange(-k, k + 1) ** 2) / (2 * r * r)); wts /= wts.sum()
    out = np.zeros_like(a, dtype=np.float32)
    for i, wt in enumerate(wts): out += wt * np.roll(a, i - k, axis=1)
    out2 = np.zeros_like(out)
    for i, wt in enumerate(wts): out2 += wt * np.roll(out, i - k, axis=0)
    return out2


# ------------------------------------------------------------------ masonry
def masonry(h, w, pxm, courses, seed, joint=2, joint_col=None, lit=2, shade=3, jit=.03, grain=.02, cloud_amp=.05,
            odd_rate=.10, fall=.05):
    """Ashlar that wraps in x. courses: [(height_m, colour, (min_len_m, max_len_m))] bottom to
    top. QUIET by design: a gentle light-to-shade fall across each stone, a 2 px soft bed
    joint a few levels darker than the stone (never a dark grid), a few beds of a visibly
    other stone, and broad warm clouds."""
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3), np.float32)
    cl = cloud(h, w, 128, seed + 1)
    gr = cloud(h, w, 8, seed + 3, 2)
    jc = joint_col if joint_col is not None else None
    y = h
    for hm, col, (l0, l1) in courses:
        ch = int(round(hm * pxm)); y0 = y - ch
        start = int(rng.integers(0, w)); covered = 0
        while covered < w:
            L = int(round(rng.uniform(l0, l1) * pxm))
            if w - covered - L < l0 * pxm * .6: L = w - covered
            v = 1 + rng.normal(0, jit)
            hue = np.array([1, .6, -.6], np.float32) * rng.normal(0, jit * .5)
            odd = rng.random()
            c = col * v * (1 + hue)
            if odd < odd_rate * .4: c = c * np.array([1.0, .975, .94], np.float32)        # a warmer bed
            elif odd < odd_rate * .7: c = (c * .8 + c.mean() * .2) * .98                   # a greyer bed
            elif odd < odd_rate: c = c * 1.03
            xs = (np.arange(start + covered, start + covered + L)) % w
            yy, xx = np.mgrid[0:ch, 0:L].astype(np.float32)
            f = 1 + fall * .5 - fall * (yy / max(1, ch - 1)) - fall * .4 * (xx / max(1, L - 1))
            blk = np.ones((ch, L, 3), np.float32) * c * f[..., None]
            blk[:lit] *= 1.05
            blk[-shade:] *= .93
            img[y0:y, xs] = blk
            jcol = jc if jc is not None else c * .86
            img[y0:y, (start + covered + np.arange(joint)) % w] = jcol
            covered += L
        img[y0:y0 + joint] = (jc if jc is not None else col * .86)
        y = y0
    img *= (1 + cloud_amp * cl)[..., None]
    img *= (1 + grain * gr)[..., None]
    return np.clip(img, 0, 255)


def put_strip(sheet, name, tile):
    y0, h, t, rep = A.STRIPS[name]
    assert tile.shape[0] == h and tile.shape[1] == W, (name, tile.shape)
    sheet[y0:y0 + h] = tile
    g = A.GUTTER
    sheet[y0 - g:y0] = tile[-g:]
    sheet[y0 + h:y0 + h + g] = tile[:g]


def strip_tufa():
    """2 m tall, 8 m across at 256 px/m: four 0.5 m courses. Light straw tufa."""
    c = PAL['tufa']
    courses = [(0.5, c, (0.7, 1.4)), (0.5, c * 1.005, (0.6, 1.2)), (0.5, c * .995, (0.7, 1.5)), (0.5, c, (0.6, 1.3))]
    # iteration 1 look pass: blocks read too contrasty at arm's length -> quieter beds
    t = masonry(512, W, 256, courses, 11, joint=3, joint_col=PAL['mortar'] * .93, jit=.006, grain=.02, cloud_amp=.03,
                odd_rate=.02, fall=.008)
    # tufa is a porous stone: a sparse, SOFT pitting (blurred, low contrast), not speckle
    rng = np.random.default_rng(13)
    p = np.zeros((512, W), np.float32)
    n = 5200
    p[rng.integers(0, 512, n), rng.integers(0, W, n)] = 1
    p = wrapblur(p, 1.1)
    t *= (1 - .55 * np.clip(p * 6, 0, 1) * .12)[..., None]
    return t


def strip_basalt():
    """2 m tall at 128 px/m: four 0.5 m courses of dressed blue-grey basalt."""
    b = PAL['basalt']
    courses = [(0.5, b, (0.5, 1.0)), (0.5, b * 1.02, (0.45, 0.9)), (0.5, b * .99, (0.5, 1.1)), (0.5, b * 1.01, (0.45, 0.95))]
    t = masonry(256, W, 128, courses, 14, joint=2, joint_col=b * .72, jit=.04, grain=.05, cloud_amp=.06,
                odd_rate=.08, fall=.08)
    # a fine tooled stipple: basalt reads hard and slightly glittering, not smooth
    t *= (1 + .045 * cloud(256, W, 4, 15, 1))[..., None]
    return t


def strip_lime():
    """The courts' lime render, 64 px/m: a warm white field with soft blotches and
    faint trowel arcs; bright on purpose (MOONMERE.md: the courts read bright)."""
    h = 128
    img = np.ones((h, W, 3), np.float32) * PAL['lime']
    img *= (1 + .04 * cloud(h, W, 48, 21) + .015 * cloud(h, W, 6, 22, 2))[..., None]
    # damp at the foot of the tile? no: the tile repeats vertically, so keep it even
    stain = np.clip(cloud(h, W, 24, 23), 0, 1) ** 2
    img *= (1 - .05 * stain)[..., None] * np.array([1.0, .995, .985], np.float32)
    return np.clip(img, 0, 255)


def strip_pale():
    """Dressed pale tufa, 128 px/m: fine joints, two 1 m courses -- sills, voussoirs, copings."""
    c = PAL['pale']
    courses = [(1.0, c, (0.8, 1.8)), (1.0, c * 1.01, (0.7, 1.6))]
    return masonry(256, W, 128, courses, 15, joint=2, joint_col=c * .85, jit=.018, grain=.02, cloud_amp=.04,
                   odd_rate=.06, fall=.03)


def strip_timber():
    """Walnut, 128 px/m, 1 m tile: boards with grain running along U."""
    h = 128
    img = np.ones((h, W, 3), np.float32) * PAL['walnut']
    n = cloud(h, W, 32, 33)
    g = cloud(h, W, 4, 35, 2)
    gx = np.asarray(Image.fromarray(((g + 1) * 127).astype(np.uint8)).resize((W // 24, h), Image.BILINEAR).resize((W, h), Image.BICUBIC), np.float32) / 127 - 1
    img *= (1 + .07 * n + .09 * gx)[..., None]
    for k in range(4):                       # board joints every 0.25 m
        y = k * 32
        img[y:y + 2] *= .62; img[y + 2:y + 3] *= 1.08
    return np.clip(img, 0, 255)


def strip_pantile():
    """Glazed pantile at the lightest firing, 64 px/m: 0.25 m rolls (16 px) by 0.25 m
    courses, a NEUTRAL warm grey (the glaze is an instance tint and sets the hue).

    LOOK PASS M2 (2026-10-06, "the big hip roofs read as flat tiled sheets with a regular
    grid"): the strip repeats every 2 m DOWN the slope but runs 32 m unique ACROSS it, so
    the irregularity is put where it cannot repeat: whole roll COLUMNS vary (a re-laid
    run, a weathered run), weathering streaks run down the slope (constant in v), single
    tiles are replaced lighter or darker, and each course's lap wanders a pixel. The
    per-tile jitter is low, so the 2 m period never reads as a stamp."""
    h = 128; c = 16
    rng = np.random.default_rng(21)
    img = np.zeros((h, W, 3), np.float32)
    yy, xx = np.mgrid[0:c, 0:c].astype(np.float32)
    prof = np.clip(np.cos((xx / c - .5) * math.pi), 0, 1) ** 1.3
    hl = np.exp(-((xx - c * .4) ** 2) / 4) * np.clip((yy - 3) / c, 0, 1) * .45
    ncol = W // c
    colv = 1 + rng.normal(0, .045, ncol)                   # each roll column its own firing
    for k in rng.choice(ncol, ncol // 9, replace=False):   # re-laid runs: a step lighter / darker
        colv[k:k + int(rng.integers(2, 6))] *= rng.choice([.9, 1.1])
    colh = rng.normal(0, .02, (ncol, 3)).astype(np.float32)
    for j in range(h // c):
        lipy = 3 + (j % 2)
        lip = np.clip(1 - yy / float(lipy), 0, 1)
        for i in range(ncol):
            v = colv[i] * rng.normal(1, .025)
            if rng.random() < .035: v *= rng.choice([.8, 1.18])        # a replaced tile
            base = PAL['tile'] * v * (1 + colh[i])
            t = base * (.70 + .38 * prof)[..., None]
            t *= (1 - .34 * lip)[..., None]
            t += (PAL['tile_hi'] - base * .7) * hl[..., None]
            img[j * c:(j + 1) * c, i * c:(i + 1) * c] = t
    # weathering streaks down the slope: vary across (u), constant along (v) -- the 2 m
    # vertical period cannot show them repeating
    st = cloud(1, W, 48, 23, 3)[0] * .07 + cloud(1, W, 12, 24, 2)[0] * .04
    img *= (1 + st)[None, :, None]
    img *= (1 + .03 * cloud(h, W, 64, 22))[..., None]
    return np.clip(img, 0, 255)


# ------------------------------------------------------------------ rect helpers
def R(name): return A.RECTS[name]


def put(sheet, name, blk):
    x, y, w, h = R(name)
    sheet[y:y + h, x:x + w] = blk


def window_glass(w, h, lit, cols=2, rows=3, frame=None, kind='casement', dim=1.0, warm=1.0):
    frame = PAL['walnut'] if frame is None else frame
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # sky reflection: a lighter blue-grey toward the top, a diagonal sheen
    blk = np.ones((h, w, 3), np.float32) * PAL['glass']
    refl = .62 + .95 * (1 - yy / h) ** 2
    sheen = np.clip(1 - abs((xx / w) - (yy / h) * .6 - .25) * 5, 0, 1) * .5
    blk = blk * refl[..., None] + np.array([58, 76, 98], np.float32) * sheen[..., None]
    nb = np.zeros((h, w, 3), np.float32)
    if lit:
        cur = 1 - .35 * np.clip(1 - np.minimum(xx, w - xx) / (w * .18), 0, 1)
        nb = PAL['lamp'] * (.55 + .45 * (yy / h))[..., None] * dim * cur[..., None] * warm
    fw = max(3, w // 18)
    m = np.zeros((h, w), bool)
    m[:fw] = m[-fw:] = True; m[:, :fw] = m[:, -fw:] = True
    if kind == 'casement':
        m[:, w // 2 - fw // 2:w // 2 + fw // 2 + 1] = True
    nc = cols * (2 if kind == 'casement' else 1)
    for c in range(1, nc):
        cx = int(w * c / nc); m[:, cx - 1:cx + 1] = True
    for r in range(1, rows):
        cy = int(h * r / rows); m[cy - 1:cy + 1] = True
    blk[m] = frame; nb[m] = 0
    return blk, nb


def paint_glass(sheet, night, name, lit=True, **kw):
    x, y, w, h = R(name)
    b, n = window_glass(w, h, lit, **kw)
    sheet[y:y + h, x:x + w] = b; night[y:y + h, x:x + w] = n


def paint_grille(sheet, night, name):
    x, y, w, h = R(name)
    b, n = window_glass(w, h, True, cols=1, rows=2, kind='plain', dim=.5)
    for i in range(1, 4):
        cx = int(w * i / 4); b[:, cx - 2:cx + 2] = PAL['basalt'] * .42; n[:, cx - 2:cx + 2] = 0
    for j in (1, 2):
        cy = int(h * j / 3); b[cy - 2:cy + 2] = PAL['basalt'] * .42; n[cy - 2:cy + 2] = 0
    sheet[y:y + h, x:x + w] = b; night[y:y + h, x:x + w] = n


def paint_shop(sheet, night, name):
    """Shop glazing: small panes over shelves of goods (jars, bolts, books) -- the
    shopfront must read as a shop from the street (Philip: "plain and the same")."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (70, 58, 46)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(41)
    for k in range(4):                                  # shelves
        sy = int(h * (.22 + k * .2))
        d.rectangle([0, sy, w, sy + 3], fill=(120, 86, 58))
        cx = 4
        while cx < w - 6:
            kind = rng.integers(0, 4); ww = int(rng.integers(6, 16)); hh = int(rng.integers(12, 30))
            col = [(196, 160, 90), (120, 150, 160), (170, 70, 52), (220, 210, 186), (90, 120, 80), (150, 110, 160)][int(rng.integers(0, 6))]
            if kind == 0: d.ellipse([cx, sy - hh, cx + ww, sy], fill=col)
            else: d.rectangle([cx, sy - hh, cx + ww, sy], fill=col)
            cx += ww + int(rng.integers(1, 5))
    a = np.asarray(im, np.float32)
    g, n = window_glass(w, h, True, cols=3, rows=3, kind='plain', dim=1.0)
    mask = (g == PAL['walnut']).all(-1)
    a = a * .85 + g * .15
    a[mask] = PAL['walnut']
    n = np.where(mask[..., None], 0, np.clip(n * .8 + a * .25, 0, 255))
    sheet[y:y + h, x:x + w] = a; night[y:y + h, x:x + w] = n


def paint_door(sheet, name, base):
    x, y, w, h = R(name)
    blk = np.ones((h, w, 3), np.float32) * base
    blk *= (1 + .06 * cloud(h, w, 16, 77, 2))[..., None]
    for k in range(1, 8):
        cx = int(w * k / 8); blk[:, cx - 1:cx + 1] *= .74
    blk[:, w // 2 - 3:w // 2 + 3] *= .64
    for fy in (.22, .62):
        cy = int(h * (1 - fy)); blk[cy - 7:cy + 7] *= .86; blk[cy - 7:cy - 5] *= 1.1
    for j in range(9):
        for i in range(5):
            cx = int(w * (i + .5) / 5); cy = int(h * (j + .5) / 9)
            blk[cy - 3:cy + 3, cx - 3:cx + 3] = PAL['basalt'] * .5
            blk[cy - 3:cy - 1, cx - 3:cx + 1] = PAL['basalt'] * .95
    for cx in (w // 2 - 16, w // 2 + 16):
        cy = int(h * .5)
        yy, xx = np.ogrid[-12:13, -12:13]
        ring = (np.abs(np.sqrt(xx ** 2 + yy ** 2) - 9) < 2.5)
        sub = blk[cy - 12:cy + 13, cx - 12:cx + 13]; sub[ring] = np.array([186, 148, 76], np.float32)
    blk[:5] *= .6; blk[:, :5] *= .6; blk[:, -5:] *= .6
    blk *= np.linspace(1.0, .84, h, dtype=np.float32)[:, None, None]
    sheet[y:y + h, x:x + w] = blk


def paint_shutter(sheet, name):
    x, y, w, h = R(name)
    base = np.array([226, 222, 212], np.float32)
    blk = np.ones((h, w, 3), np.float32) * base
    for k in range(0, h, 9):
        blk[k:k + 2] *= .66; blk[k + 2:k + 4] *= 1.04
    blk[:, :6] = base * .84; blk[:, -6:] = base * .84
    blk[:6] = base * .84; blk[-6:] = base * .8
    blk[h // 2 - 4:h // 2 + 4] = base * .86
    sheet[y:y + h, x:x + w] = blk


def paint_louvre(sheet, night, name, shut):
    x, y, w, h = R(name)
    wood = PAL['walnut'] * 1.3
    if shut:
        # MM-7: shut and PAINTED OVER, chalky grey-green. LOOK PASS M2 (2026-10-06: the cloud-
        # mottled sheet "read as camouflage noise"): one flat coat per slat, a lit top edge and
        # a shadow line under it, a faint vertical brush grain, a few small flakes to the wood
        wood = PAL['shutgreen']
    blk = np.ones((h, w, 3), np.float32) * wood
    nb = np.zeros((h, w, 3), np.float32)
    n = 16 if shut else 15
    slat = h / n
    if shut:
        rng = np.random.default_rng(41)
        grain = (1 + .025 * cloud(h, w, 2, 42, 1) * np.linspace(.6, 1, w)[None, :])
        blk *= grain[..., None]
        for k in range(n):
            y0 = int(round(k * slat)); y1 = int(round((k + 1) * slat))
            blk[y0:y1] *= rng.normal(1, .015)
            blk[y0:y0 + 2] *= .58; blk[y0 + 2:y0 + 4] *= 1.1          # the lap's shadow, the lit nose
            blk[y1 - 3:y1] *= .9
        for _ in range(9):
            fx, fy = int(rng.integers(8, w - 12)), int(rng.integers(4, h - 8))
            blk[fy:fy + 2, fx:fx + int(rng.integers(3, 8))] = PAL['walnut'] * 1.1
    else:
        sl = h // 15
        for k in range(15):
            y0 = k * sl
            blk[y0 + sl // 2:y0 + sl] = PAL['glass'] * .6
            nb[y0 + sl // 2:y0 + sl, 6:w - 6] = PAL['lamp'] * .33
            blk[y0:y0 + 2] *= 1.15
        blk *= (1 + .08 * cloud(h, w, 16, 37, 2))[..., None]
    blk[:, :6] = wood * .8; blk[:, -6:] = wood * .8; blk[:, w // 2 - 3:w // 2 + 3] = wood * .75
    nb[:, :6] = 0; nb[:, -6:] = 0; nb[:, w // 2 - 3:w // 2 + 3] = 0
    sheet[y:y + h, x:x + w] = blk; night[y:y + h, x:x + w] = nb


def _leaves(d, rng, w, h, n, size, cols, shape='lance', light=True, margin=0):
    """n leaves drawn into an ImageDraw: shape 'lance' (lemon, bay), 'ivy' (three-lobed),
    'round' (wisteria, rose). cols: (shade, mid, lit) RGB; the lit share rises toward the top
    so a cluster reads lit from above (the nature remake's crown)."""
    for _ in range(n):
        cx, cy = rng.uniform(-margin, w + margin), rng.uniform(-margin, h + margin)
        L = rng.uniform(*size); a = rng.uniform(0, math.pi * 2)
        t = (1 - cy / h) if light else .5
        k = min(2, max(0, int(rng.random() * 1.4 + t * 1.6)))
        base = np.array(cols[k], np.float32) * rng.uniform(.88, 1.1)
        ca, sa = math.cos(a), math.sin(a)
        if shape == 'ivy':
            pts = []
            for q in range(10):
                ang = q / 10 * 2 * math.pi
                r = L * (1.0 if q % 3 == 0 else .55)
                pts.append((cx + r * math.cos(ang + a), cy + r * math.sin(ang + a)))
        elif shape == 'round':
            pts = [(cx + L * .5 * math.cos(q / 8 * 6.283 + a), cy + L * .38 * math.sin(q / 8 * 6.283 + a)) for q in range(8)]
        else:
            wd = L * .32
            loc = [(L / 2, 0), (L * .2, wd / 2), (-L * .3, wd / 2), (-L / 2, 0), (-L * .3, -wd / 2), (L * .2, -wd / 2)]
            pts = [(cx + u * ca - v * sa, cy + u * sa + v * ca) for u, v in loc]
        d.polygon(pts, fill=tuple(int(min(255, c)) for c in base))
        if shape == 'lance' and L > 9:
            d.line([(cx - L * .45 * ca, cy - L * .45 * sa), (cx + L * .45 * ca, cy + L * .45 * sa)],
                   fill=tuple(int(c * .8) for c in base), width=1)


def paint_foliage(sheet, name, lemons=False, seed=61):
    """A crown's leaf cluster, filled edge to edge (the cluster polygons are opaque: no gaps
    to show the background): a dark under-layer, then glossy lance leaves lit from above."""
    x, y, w, h = R(name)
    rng = np.random.default_rng(seed)
    im = Image.new('RGB', (w, h), (36, 60, 32)); d = ImageDraw.Draw(im)
    _leaves(d, rng, w, h, 420, (8, 15), [(40, 70, 36), (58, 96, 46), (86, 130, 60)], margin=6)
    _leaves(d, rng, w, h, 260, (9, 16), [(52, 88, 42), (78, 122, 56), (124, 164, 78)], margin=6)
    if lemons:
        for _ in range(16):
            cx, cy = rng.uniform(10, w - 10), rng.uniform(10, h - 10)
            rx, ry = rng.uniform(5, 7), rng.uniform(6.5, 8.5)
            d.ellipse([cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1], fill=(120, 96, 30))
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(236, 198, 64))
            d.ellipse([cx - rx * .55, cy - ry * .7, cx - rx * .05, cy - ry * .15], fill=(252, 232, 140))
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.35)), np.float32)


def paint_ivy(sheet, name):
    x, y, w, h = R(name)
    rng = np.random.default_rng(63)
    im = Image.new('RGB', (w, h), (30, 50, 30)); d = ImageDraw.Draw(im)
    _leaves(d, rng, w, h, 520, (4, 8), [(34, 60, 34), (52, 88, 46), (84, 124, 64)], shape='ivy', margin=4)
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.3)), np.float32)


def paint_flowery(sheet, name, leafcols, flowers, seed, shape='lance', size=(6, 11), fsize=(2.5, 4.5), nf=60, racemes=False):
    """Leaves with flowers among them (planters, a climbing rose, wisteria). flowers: list of
    (rgb, weight). racemes: drooping lilac cones (wisteria) instead of round heads."""
    x, y, w, h = R(name)
    rng = np.random.default_rng(seed)
    im = Image.new('RGB', (w, h), tuple(int(c * .7) for c in leafcols[0])); d = ImageDraw.Draw(im)
    _leaves(d, rng, w, h, int(w * h / 55), size, leafcols, shape=shape, margin=5)
    wts = np.array([f[1] for f in flowers], np.float64); wts /= wts.sum()
    if racemes:
        for _ in range(nf):
            cx, cy = rng.uniform(4, w - 4), rng.uniform(-10, h - 30)
            L = rng.uniform(22, 40); col = np.array(flowers[rng.choice(len(flowers), p=wts)][0], np.float32)
            for k in range(14):
                t = k / 13; r = 5.5 * (1 - t * .75)
                px, py = cx + rng.normal(0, .8), cy + L * t
                cc = col * (1.12 - .3 * t) * rng.uniform(.9, 1.1)
                d.ellipse([px - r, py - r * .8, px + r, py + r * .8], fill=tuple(int(min(255, c)) for c in cc))
    else:
        for _ in range(nf):
            cx, cy = rng.uniform(3, w - 3), rng.uniform(3, h - 3)
            col = np.array(flowers[rng.choice(len(flowers), p=wts)][0], np.float32)
            r = rng.uniform(*fsize)
            for k in range(5):
                a = k / 5 * 6.283 + rng.uniform(0, 1)
                px, py = cx + math.cos(a) * r * .6, cy + math.sin(a) * r * .6
                d.ellipse([px - r * .55, py - r * .55, px + r * .55, py + r * .55], fill=tuple(int(min(255, c * rng.uniform(.9, 1.08))) for c in col))
            d.ellipse([cx - r * .3, cy - r * .3, cx + r * .3, cy + r * .3], fill=(232, 196, 90))
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.35)), np.float32)


def paint_loft(sheet, name):
    x, y, w, h = R(name)
    base = PAL['walnut'] * 1.5
    blk = np.ones((h, w, 3), np.float32) * base
    blk *= (1 + .1 * cloud(h, w, 16, 91, 2))[..., None]
    for k in range(1, 6):
        cx = int(w * k / 6); blk[:, cx - 1:cx + 1] *= .62
    blk[:, w // 2 - 2:w // 2 + 2] *= .5
    for fy in (.15, .85):
        cy = int(h * fy); blk[cy - 6:cy + 6] *= .8
    for t in np.linspace(0, 1, 200):
        cx = int(6 + t * (w - 12)); cy = int(h * .15 + t * h * .7)
        blk[cy - 3:cy + 3, cx - 3:cx + 3] = base * .78
    blk[:4] *= .6; blk[-4:] *= .6; blk[:, :4] *= .6; blk[:, -4:] *= .6
    sheet[y:y + h, x:x + w] = blk


def paint_goods(sheet, night, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (84, 66, 50)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(57)
    for k in range(4):
        sy = int(h * (.25 + k * .24)); d.rectangle([0, sy, w, sy + 4], fill=(132, 96, 62))
        cx = 3
        while cx < w - 6:
            ww = int(rng.integers(5, 14)); hh = int(rng.integers(10, 24))
            col = [(196, 160, 90), (120, 150, 160), (170, 70, 52), (220, 210, 186), (90, 120, 80), (60, 80, 120)][int(rng.integers(0, 6))]
            if rng.random() < .4: d.ellipse([cx, sy - hh, cx + ww, sy], fill=col)
            else: d.rectangle([cx, sy - hh, cx + ww, sy], fill=col)
            cx += ww + int(rng.integers(1, 4))
    a = np.asarray(im, np.float32)
    sheet[y:y + h, x:x + w] = a; night[y:y + h, x:x + w] = a * .35


def paint_books(sheet, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (70, 50, 36)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(61)
    rows = 4; rh = h // rows
    for r in range(rows):
        y0 = r * rh; d.rectangle([0, y0 + rh - 4, w, y0 + rh], fill=(110, 78, 50))
        cx = 2
        while cx < w - 3:
            ww = int(rng.integers(3, 8)); hh = int(rng.integers(rh - 14, rh - 5))
            col = [(120, 46, 36), (52, 70, 96), (96, 86, 50), (60, 86, 60), (150, 120, 80), (88, 50, 70), (200, 186, 150)][int(rng.integers(0, 7))]
            d.rectangle([cx, y0 + rh - 4 - hh, cx + ww, y0 + rh - 4], fill=col)
            if rng.random() < .5: d.rectangle([cx, y0 + rh - 4 - hh + 4, cx + ww, y0 + rh - 4 - hh + 6], fill=(200, 170, 90))
            cx += ww + (1 if rng.random() < .8 else 4)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32)


def paint_rock(sheet, name):
    """Columnar basalt on a bare riser (D-16): tall facets, blue-grey, lichen at the
    ledges -- crater-like rock, never a built wall (ruling 2)."""
    x, y, w, h = R(name)
    rng = np.random.default_rng(71)
    # the rock is the basalt weathered grey (iteration 2: the dressed basalt's blue read as
    # a blue curtain on the bare risers at 60 m)
    img = np.ones((h, w, 3), np.float32) * (PAL['basalt'] * .5 + np.array([112, 112, 108], np.float32) * .5)
    cx = 0
    while cx < w:
        cw = int(rng.integers(8, 20)); v = rng.normal(1, .08)
        img[:, cx:cx + cw] *= v
        img[:, cx:cx + 2] *= .7; img[:, cx + 2:cx + 3] *= 1.1
        # cross joints
        yy = 0
        while yy < h:
            seg = int(rng.integers(18, 60)); img[yy:yy + 2, cx:cx + cw] *= .72; yy += seg
        cx += cw
    img *= (1 + .1 * cloud(h, w, 24, 72) + .05 * cloud(h, w, 4, 73, 2))[..., None]
    lich = np.clip(cloud(h, w, 12, 74), 0, 1) ** 2
    img = img * (1 - .35 * lich[..., None]) + np.array([150, 156, 120], np.float32) * .35 * lich[..., None]
    sheet[y:y + h, x:x + w] = np.clip(img, 0, 255)


def paint_sign(sheet, name, kind):
    """Painted hanging signs, no text: a quill and inkpot, a cup and steam, a key."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (44, 60, 74)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=(196, 160, 88), width=4)
    d.rectangle([6, 6, w - 7, h - 7], outline=(120, 96, 60), width=1)
    gold = (214, 178, 96); cream = (236, 226, 200)
    if kind == 'quill':
        d.ellipse([w * .55, h * .58, w * .8, h * .82], fill=(30, 30, 36), outline=gold, width=2)
        d.polygon([(w * .25, h * .82), (w * .3, h * .78), (w * .72, h * .15), (w * .78, h * .2)], fill=cream)
        d.line([(w * .27, h * .8), (w * .75, h * .18)], fill=(150, 140, 120), width=2)
    elif kind == 'cup':
        d.rectangle([w * .32, h * .45, w * .62, h * .78], fill=cream)
        d.arc([w * .56, h * .5, w * .74, h * .7], -90, 90, fill=cream, width=4)
        d.rectangle([w * .26, h * .78, w * .7, h * .82], fill=gold)
        for k in range(3): d.arc([w * (.35 + k * .08), h * .15, w * (.45 + k * .08), h * .42], 200, 340, fill=(200, 200, 200), width=2)
    else:
        d.ellipse([w * .2, h * .35, w * .42, h * .62], outline=gold, width=5)
        d.rectangle([w * .42, h * .46, w * .8, h * .52], fill=gold)
        d.rectangle([w * .66, h * .52, w * .7, h * .62], fill=gold); d.rectangle([w * .74, h * .52, w * .78, h * .6], fill=gold)
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.4)), np.float32)


def paint_leafy(sheet, name, base, accent=None, n=260, seed=55, size=(5, 11), bg=None):
    x, y, w, h = R(name)
    rng = np.random.default_rng(seed)
    im = Image.new('RGB', (w, h), bg or tuple(int(c * .65) for c in base)); d = ImageDraw.Draw(im)
    for _ in range(n):
        cx, cy = rng.integers(0, w), rng.integers(0, h)
        r = rng.integers(*size); a = rng.uniform(0, math.pi)
        v = rng.uniform(.8, 1.3)
        col = tuple(int(min(255, c * v)) for c in base)
        pts = [(cx + r * math.cos(a), cy + r * math.sin(a) * .5), (cx + r * .3 * math.cos(a + 1.6), cy + r * .3 * math.sin(a + 1.6)),
               (cx - r * math.cos(a), cy - r * math.sin(a) * .5), (cx + r * .3 * math.cos(a - 1.6), cy + r * .3 * math.sin(a - 1.6))]
        for ox in (-w, 0, w):
            for oy in (-h, 0, h):
                d.polygon([(px + ox, py + oy) for px, py in pts], fill=col)
    if accent:
        for col, k, rr in accent:
            for _ in range(k):
                cx, cy = rng.integers(6, w - 6), rng.integers(6, h - 6)
                d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32)


def paint_scorch(sheet, name):
    """Soot rising in tongues: dense at the bottom-centre (a window head, a door, the foot of a
    case), feathering up and out to NOTHING at the panel's sides and top. S3 (L2, LOOKED at the
    Burned Shelf: "soot" read as hard-edged pink-brown rectangles pasted over every window). The
    panel lies on the burned tufa (TufaB: the tufa at 0.9, under the planner's burned-pink wash, which
    tints both alike), so the ground the soot fades into IS that wall's colour and the panel's edge
    never shows; the soot itself near black, broken into licks by the noise."""
    x, y, w, h = R(name)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    n = cloud(h, w, 14, 81, 3)
    fx, fy = xx / (w - 1), yy / (h - 1)          # fy: 0 at the panel's top, 1 at its foot
    side = np.clip(1 - np.abs(fx - .5) * 2, 0, 1)
    # three licks across the panel, the middle one tallest
    licks = .55 + .45 * np.cos((fx - .5) * 3 * np.pi) ** 2
    t = side ** .6 * (.15 + .85 * fy ** .7) * (.75 + .25 * licks) + .32 * n
    a = np.clip((t - .18) / .5, 0, 1)
    # to nothing at the sides and the top, and most of the way at the foot
    a *= np.clip(np.minimum(fx, 1 - fx) * 7, 0, 1) * np.clip(fy * 5, 0, 1) * np.clip((1 - fy) * 14 + .35, 0, 1)
    soot = np.array([24, 21, 21], np.float32); stone = PAL['tufa'] * .9
    out = stone * (1 - a[..., None]) + soot * a[..., None]
    sheet[y:y + h, x:x + w] = np.clip(out, 0, 255)


def paint_tongues(sheet, name, tongues, seed, ground=None, smear=0.0):
    """S3 review (A-13: "every tongue on the inner walls and every patch over the outer windows is the
    same three-lick shape"): soot of ANOTHER shape for the same panels. tongues: [(cx, half width,
    height, lean)] in panel fractions -- each a broad smoke plume rising from the foot, narrowing and
    thinning as it climbs and leaning with the draught; smear: a low band along the foot. Soft
    throughout (LOOKED: hard-edged tongues read as painted black flames): the plumes' density falls
    off gradually, the noise breaks them into smoke, the whole blurred. The same rules as
    paint_scorch: it fades to NOTHING at the sides and the top and most of the way at the foot, on
    the burned tufa's own colour, so the panel's edge never shows."""
    x, y, w, h = R(name)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fx, fy = xx / (w - 1), yy / (h - 1)          # fy: 0 at the top, 1 at the foot
    n = cloud(h, w, 16, seed, 3)
    up = 1 - fy                                  # 0 at the foot, 1 at the top
    t = np.zeros((h, w), np.float32)
    for cx, hw, ht, lean in tongues:
        c = cx + lean * up
        r = hw * (1.0 - .45 * np.clip(up / ht, 0, 1)) + .04
        across = np.exp(-((fx - c) / r) ** 2 * 1.6)
        rise = np.clip(1 - up / (ht * 1.25), 0, 1) ** .8
        t = np.maximum(t, across * rise)
    if smear:
        t = np.maximum(t, np.clip(1 - up / smear, 0, 1) ** 1.2 * .8)
    t = t * (.8 + .55 * n) + .12 * n
    a = np.clip((t - .1) / .4, 0, 1) ** .85 * .96
    a *= np.clip(np.minimum(fx, 1 - fx) * 7, 0, 1) * np.clip(fy * 5, 0, 1) * np.clip((1 - fy) * 14 + .35, 0, 1)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.3)), np.float32) / 255
    soot = np.array([24, 21, 21], np.float32); stone = PAL['tufa'] * .9 if ground is None else ground
    sheet[y:y + h, x:x + w] = np.clip(stone * (1 - a[..., None]) + soot * a[..., None], 0, 255)


def paint_scorch_lip(sheet, name):
    """Soot at a furnace stack's lip (al_shell's 'sts' panel, on the stack's basalt): black under the
    cap, thinning DOWN the shaft in streaks -- not a lick rising from the panel's foot (A-13: the old
    swatch put its dark band a metre below the lip)."""
    x, y, w, h = R(name)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fx, fy = xx / (w - 1), yy / (h - 1)
    n = cloud(h, w, 10, 87, 3)
    streak = .5 + .5 * np.sin(fx * 23.0 + 3 * n)
    a = np.clip((1 - fy) ** 1.6 * (1.15 + .35 * streak) + .25 * n - .15, 0, 1)
    a *= np.clip((1 - fy) * 6, 0, 1)             # to nothing at the panel's foot
    soot = np.array([22, 20, 20], np.float32); stone = PAL['basalt'] * 1.0
    sheet[y:y + h, x:x + w] = np.clip(stone * (1 - a[..., None]) + soot * a[..., None], 0, 255)


def paint_linen_b(sheet, name):
    """Three more cloths for the drying yard (A-13): a blue gingham, a white towel with a red
    stripe, an ochre cloth -- one a third of the rect, each cloth a quad of its own."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (230, 224, 206)); d = ImageDraw.Draw(im)
    t = w // 3
    for k in range(0, t, 6):
        d.rectangle([k, 0, k + 2, h], fill=(150, 176, 204))
    for k in range(0, h, 6):
        d.rectangle([0, k, t - 1, k + 2], fill=(170, 192, 214))
    d.rectangle([t, 0, 2 * t - 1, h], fill=(238, 234, 222))
    for yy_ in (h // 5, h // 5 + 5):
        d.rectangle([t, yy_, 2 * t - 1, yy_ + 2], fill=(176, 60, 52))
    d.rectangle([2 * t, 0, w, h], fill=(206, 168, 92))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fold = 1 + .045 * np.sin(xx * 2 * np.pi / 13.0 + 1.1 * np.sin(yy / 8.0)) - .05 * (yy / h)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32) * (fold * (1 + .03 * cloud(h, w, 8, 96, 2)))[..., None]


def paint_glass_in(sheet, name):
    """A window seen from INSIDE a room (the interiors' linings, A-13): pale daylit panes in a light
    painted frame, brighter toward the head. No night twin: the panes go dark with the night."""
    x, y, w, h = R(name)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    blk = np.ones((h, w, 3), np.float32) * np.array([176, 194, 204], np.float32)
    blk *= (.86 + .2 * (1 - yy / h))[..., None]
    fw = max(3, w // 16)
    m = np.zeros((h, w), bool)
    m[:fw] = m[-fw:] = True; m[:, :fw] = m[:, -fw:] = True
    m[:, w // 2 - 1:w // 2 + 2] = True
    for r in range(1, 3):
        cy = int(h * r / 3); m[cy - 1:cy + 1] = True
    blk[m] = np.array([214, 204, 182], np.float32)
    sheet[y:y + h, x:x + w] = blk


def paint_board(sheet, name):
    x, y, w, h = R(name)
    blk = np.ones((h, w, 3), np.float32) * np.array([40, 54, 64], np.float32)
    blk[:4] = blk[-4:] = PAL['walnut']; blk[:, :4] = blk[:, -4:] = PAL['walnut']
    rng = np.random.default_rng(12)
    for r in range(4):
        cy = 10 + r * 13; cx = 10
        while cx < w - 12:
            L = int(rng.integers(3, 12))
            blk[cy:cy + 3, cx:cx + L] = np.array([206, 172, 94], np.float32)
            cx += L + int(rng.integers(3, 7))
    sheet[y:y + h, x:x + w] = blk


def paint_plaque(sheet, name):
    """A glazed tile plaque: the academy's brass ring and three stars on a deep blue
    field, a cream border -- set over gates and doors."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (232, 222, 196)); d = ImageDraw.Draw(im)
    d.rectangle([6, 6, w - 7, h - 7], fill=(46, 74, 120))
    d.ellipse([w * .22, h * .22, w * .78, h * .78], outline=(214, 178, 96), width=6)
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        cx, cy = w / 2 + math.cos(a) * w * .14, h / 2 - math.sin(a) * h * .14
        d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(240, 230, 200))
    for t in range(0, w, 11):
        d.line([(t, 0), (t, 5)], fill=(46, 74, 120), width=2)
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.5)), np.float32)


def paint_cotto(sheet, name):
    """Roof-terrace cotto. A-7 (the look review: "uniform fine salmon tile, like bathroom
    grid"): LARGE-FORMAT tiles, 4 x 4 to the 2 m rect (half-metre squares), each its own
    firing from pale biscuit to deep rose, a slow colour drift across the lay, a worn PATH
    across the square (bleached, smoothed, its joints filled), and broad grout that reads at
    roof distance. roof_flat turns and mirrors each square against its neighbours."""
    x, y, w, h = R(name)
    rng = np.random.default_rng(73)
    c = w // 4
    blk = np.zeros((h, w, 3), np.float32)
    base = np.array([196, 140, 110], np.float32)
    drift = cloud(h, w, 64, 74, 2)
    for j in range(4):
        for i in range(4):
            v = rng.normal(1, .09); hue = np.array([0, rng.normal(0, .045), rng.normal(0, .07)], np.float32)
            t = base * v * (1 + hue)
            if rng.random() < .12: t = t * np.array([1.08, 1.1, 1.12], np.float32)       # a bleached tile
            if rng.random() < .1: t = t * np.array([.92, .86, .84], np.float32)          # a deep one
            blk[j * c:(j + 1) * c, i * c:(i + 1) * c] = t
    blk *= (1 + .1 * drift + .05 * cloud(h, w, 8, 75, 2))[..., None]
    # the worn path: a soft diagonal band, lighter and flatter
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.abs((xx - w * .2) * .6 - (yy - h * .1) * .8) / (w * .22)
    wear = np.clip(1 - d, 0, 1) ** 1.6
    blk = blk * (1 - .18 * wear[..., None]) + np.array([214, 178, 150], np.float32) * (.18 * wear[..., None])
    grout = np.array([206, 186, 160], np.float32)
    for k in range(5):
        q = min(k * c, w - 1)
        g2 = 2
        blk[max(0, q - g2):q + g2, :] = blk[max(0, q - g2):q + g2, :] * .35 + grout * .65
        blk[:, max(0, q - g2):q + g2] = blk[:, max(0, q - g2):q + g2] * .35 + grout * .65
    sheet[y:y + h, x:x + w] = np.clip(blk, 0, 255)


def paint_plaque_moon(sheet, name):
    """A glazed tile: Moonmere's crescent and its star over three waves (no text)."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (234, 226, 204)); d = ImageDraw.Draw(im)
    d.rectangle([5, 5, w - 6, h - 6], fill=(54, 90, 132))
    d.rectangle([9, 9, w - 10, h - 10], outline=(214, 178, 96), width=2)
    d.ellipse([w * .26, h * .16, w * .66, h * .56], fill=(240, 226, 170))
    d.ellipse([w * .36, h * .12, w * .76, h * .52], fill=(54, 90, 132))
    cx, cy = w * .7, h * .26
    d.polygon([(cx + 6 * math.cos(k * math.pi / 5 - math.pi / 2) * (1 if k % 2 == 0 else .42),
                cy + 6 * math.sin(k * math.pi / 5 - math.pi / 2) * (1 if k % 2 == 0 else .42)) for k in range(10)], fill=(240, 226, 170))
    for k, yy in enumerate((.66, .74, .82)):
        for t in range(0, w - 20, 12):
            d.arc([12 + t, h * yy - 4, 24 + t, h * yy + 4], 180, 360, fill=(220, 232, 236), width=2)
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.45)), np.float32)


def paint_plaque_lemon(sheet, name):
    """A glazed tile: a lemon branch on white, a yellow-ochre border (the courts' lemons)."""
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (198, 150, 52)); d = ImageDraw.Draw(im)
    d.rectangle([6, 6, w - 7, h - 7], fill=(238, 234, 222))
    for t in range(8, w - 8, 10):
        d.ellipse([t, 2, t + 4, 6], fill=(54, 90, 132)); d.ellipse([t, h - 7, t + 4, h - 3], fill=(54, 90, 132))
    d.line([(w * .18, h * .78), (w * .5, h * .48), (w * .82, h * .3)], fill=(110, 84, 50), width=3)
    for (lx, ly, a) in ((.3, .6, .6), (.45, .38, -.4), (.62, .5, .9), (.72, .24, -.2), (.56, .3, .3)):
        cx, cy = w * lx, h * ly
        pts = [(cx + 11 * math.cos(a + q * math.pi / 3) * (1 if q % 3 == 0 else .35), cy + 11 * math.sin(a + q * math.pi / 3) * (1 if q % 3 == 0 else .35)) for q in range(6)]
        d.polygon(pts, fill=(62, 120, 64))
    for (lx, ly) in ((.36, .74), (.66, .64)):
        cx, cy = w * lx, h * ly
        d.ellipse([cx - 9, cy - 11, cx + 9, cy + 11], fill=(232, 192, 50))
        d.ellipse([cx - 5, cy - 8, cx - 1, cy - 3], fill=(250, 230, 140))
    sheet[y:y + h, x:x + w] = np.asarray(im.filter(ImageFilter.GaussianBlur(.45)), np.float32)


def paint_chart(sheet, night, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (36, 44, 70)); d = ImageDraw.Draw(im)
    rng = np.random.default_rng(91)
    d.ellipse([8, 4, w - 8, h - 4], outline=(206, 180, 110), width=2)
    for _ in range(70):
        cx, cy = rng.integers(10, w - 10), rng.integers(6, h - 6); r = rng.choice([1, 1, 1, 2])
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 230, 200))
    for _ in range(6):
        pts = [(rng.integers(10, w - 10), rng.integers(6, h - 6)) for _ in range(3)]
        d.line(pts, fill=(140, 130, 100), width=1)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32)


def paint_linen(sheet, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (230, 224, 206)); d = ImageDraw.Draw(im)
    d.rectangle([w // 3, 0, 2 * w // 3, h], fill=(150, 170, 190))
    d.rectangle([2 * w // 3, 0, w, h], fill=(210, 180, 150))
    # (A-13, LOOKED: a pale weave line every 6 px read as STRIPES once a cloth was its own third of the
    # rect -- W3's sheets as striped canvas again. Soft folds instead: a low ripple across each cloth)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fold = 1 + .045 * np.sin(xx * 2 * np.pi / 11.0 + 1.3 * np.sin(yy / 9.0)) - .05 * (yy / h)
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32) * (fold * (1 + .03 * cloud(h, w, 8, 95, 2)))[..., None]


def paint_net(sheet, name):
    x, y, w, h = R(name)
    blk = np.ones((h, w, 3), np.float32) * np.array([96, 88, 70], np.float32)
    for k in range(0, w, 5): blk[:, k:k + 1] = np.array([196, 184, 150], np.float32)
    for k in range(0, h, 5): blk[k:k + 1] = np.array([196, 184, 150], np.float32)
    sheet[y:y + h, x:x + w] = blk


def paint_eave_band(sheet, name):
    """LOD1/skyline soffit: a 4 m eave's underside with four brackets' silhouettes and
    their shadows painted, so the bracketed eave keeps its look when eave_brk switches
    off at 45 m (MOONMERE.md "the answer to the 66% eave problem")."""
    x, y, w, h = R(name)
    blk = np.ones((h, w, 3), np.float32) * PAL['walnut'] * .62
    for k in range(h): blk[k] *= .8 + .35 * k / h
    for i in range(4):
        cx = int(w * (i + .5) / 4)
        blk[:, cx - 3:cx + 3] = PAL['walnut'] * 1.15
        blk[:, cx + 3:cx + 8] *= .55
    for k in range(0, h, 8): blk[k:k + 1] *= .8
    sheet[y:y + h, x:x + w] = blk


def paint_balus(sheet, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (62, 52, 46)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 4], fill=(110, 78, 54))
    for k in range(16):
        cx = int(w * (k + .5) / 16); d.rectangle([cx - 2, 4, cx + 2, h - 3], fill=(108, 76, 52))
    d.rectangle([0, h - 3, w, h], fill=(110, 78, 54))
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32)


def paint_arcade(sheet, night, name):
    x, y, w, h = R(name)
    im = Image.new('RGB', (w, h), (226, 214, 190)); d = ImageDraw.Draw(im)
    imn = Image.new('RGB', (w, h), (0, 0, 0)); dn = ImageDraw.Draw(imn)
    d.rectangle([0, h - 5, w, h], fill=(86, 100, 124))
    d.rectangle([9, 32, w - 9, h - 5], fill=(84, 74, 66)); d.ellipse([9, 12, w - 9, 52], fill=(84, 74, 66))
    dn.rectangle([12, 40, w - 12, h - 5], fill=(110, 74, 34))
    for i in range(9):
        a0 = math.pi + i * math.pi / 9; a1 = a0 + math.pi / 9
        cx, cy = w / 2, 32
        col = (240, 228, 196) if i % 2 == 0 else (86, 100, 124)
        pts = [(cx + (w / 2 - 9) * math.cos(a0), cy + 20 * math.sin(a0)), (cx + (w / 2 - 2) * math.cos(a0), cy + 27 * math.sin(a0)),
               (cx + (w / 2 - 2) * math.cos(a1), cy + 27 * math.sin(a1)), (cx + (w / 2 - 9) * math.cos(a1), cy + 20 * math.sin(a1))]
        d.polygon(pts, fill=col)
    d.rectangle([0, 28, 8, h - 5], fill=(240, 228, 196)); d.rectangle([w - 8, 28, w, h - 5], fill=(240, 228, 196))
    sheet[y:y + h, x:x + w] = np.asarray(im, np.float32); night[y:y + h, x:x + w] = np.asarray(imn, np.float32)


def paint_round(sheet, night, name):
    x, y, w, h = R(name)
    b, n = window_glass(w, h, True, cols=2, rows=2, kind='plain', frame=PAL['pale'] * .8)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    out = ((xx - w / 2) ** 2 + (yy - h / 2) ** 2) > (w / 2 - 2) ** 2
    b[out] = PAL['pale'] * .9; n[out] = 0
    sheet[y:y + h, x:x + w] = b; night[y:y + h, x:x + w] = n


def swatch(sheet, night, name, col, lit=None):
    x, y, w, h = R(name)
    sheet[y:y + h, x:x + w] = col
    if lit is not None: night[y:y + h, x:x + w] = lit


# ------------------------------------------------------------------ LOD2 elevations
def strip_small(sheet, name, pxm, metres_h=16, metres_w_out=None):
    """A strip resampled to pxm and tiled to metres_h tall -- and to metres_w_out wide (review
    2026-10-06: the Long Tower's 12 m shaft was cropped from an 8 m strip, its right third
    left BLACK on lt_shell_l1, the far model of the city's landmark)."""
    y0, h, t, rep = A.STRIPS[name]
    metres_w = t * rep
    src = Image.fromarray(np.clip(sheet[y0:y0 + h], 0, 255).astype(np.uint8))
    tile = src.resize((max(1, int(round(metres_w * pxm))), max(1, int(round(t * pxm)))), Image.LANCZOS)
    reps = int(math.ceil(metres_h / t)) + 1
    xreps = int(math.ceil((metres_w_out or metres_w) / metres_w))
    out = Image.new('RGB', (tile.width * xreps, tile.height * reps))
    for k in range(reps):
        for j in range(xreps): out.paste(tile, (j * tile.width, k * tile.height))
    return out


def elevation(sheet, night, slot):
    """A bay's painted elevation, matching the builder's bay numbers (moonmere_cloister
    builder, section RANKS): the LOD2 card shows these rows from y0m (-2.4) up."""
    x, y, w, h = R('elev_' + slot)
    pxm = A.ELEV['pxmOf'].get(slot, A.ELEV['pxm'])
    y0m = A.ELEV['y0m'] if slot != 'tower' else 0.0
    wm = A.ELEV['slots'][slot]
    im = Image.new('RGB', (w, h), (0, 0, 0)); d = ImageDraw.Draw(im)
    imn = Image.new('RGB', (w, h), (0, 0, 0)); dn = ImageDraw.Draw(imn)
    B = tuple(int(c) for c in PAL['basalt']); P = tuple(int(c) for c in PAL['pale']); DK = (34, 40, 46); WD = (94, 64, 46)
    LAMP = (255, 196, 110); DIM = (120, 80, 38); OAK = (112, 80, 52); SH = (70, 62, 58)
    X = lambda m: int(round((m + wm / 2) * pxm))
    Y = lambda m: h - int(round((m - y0m) * pxm))

    def rect(xa, xb, ya, yb, col, ncol=None):
        r_ = [X(xa), Y(yb), max(X(xa), X(xb) - 1), max(Y(yb), Y(ya) - 1)]
        d.rectangle(r_, fill=col)
        if ncol is not None: dn.rectangle(r_, fill=ncol)

    def tex(name, xa, xb, ya, yb):
        t = strip_small(sheet, name, pxm, metres_w_out=xb - xa)
        bx = (X(xa), Y(yb), X(xb), Y(ya))
        im.paste(t.crop((0, 0, bx[2] - bx[0], bx[3] - bx[1])), bx[:2])

    def win(cx, sill, ww, hh, lit=True, frame=P):
        if frame: rect(cx - ww / 2 - .12, cx + ww / 2 + .12, sill - .14, sill + hh + .14, frame)
        rect(cx - ww / 2, cx + ww / 2, sill, sill + hh, DK, LAMP if lit is True else (DIM if lit == 'dim' else None))

    def band(ya, hh=.24, col=B):
        rect(-wm / 2, wm / 2, ya, ya + hh, col)

    if slot in ('ct', 'st', 'hl'):
        E = {'ct': 11.6, 'st': 12.0, 'hl': 11.4}[slot]
        pl = 0.6 if slot == 'hl' else 1.2
        tex('tufa', -2, 2, pl, E); tex('basalt', -2, 2, -2.4, pl); rect(-2, 2, pl - .08, pl + .04, P)
        if slot == 'ct':
            band(4.66); band(8.2, .2)
            rect(-2, 2, 8.4, 11.3, SH); rect(-2, 2, 11.3, 11.6, WD)
            for px in (-1.0, 1.0): rect(px - .5, px + .5, 8.45, 10.8, DK, (200, 140, 70))
            for px in (-2, 0, 2): rect(px - .12, px + .12, 8.4, 11.3, WD)
            rect(-2, 2, 9.35, 9.45, WD)
            for px in (-1.0, 1.0): win(px, 2.9, .8, 1.0, 'dim', B)
            win(0, 5.4, 1.0, 2.0, True)
        elif slot == 'st':
            band(4.66); band(8.26)
            rect(-2, 2, 11.7, 12.0, WD)
            for px in (-.95, .95):
                win(px, 2.8, .75, 1.0, 'dim', B); win(px, 5.4, .95, 2.0, px > 0); win(px, 9.1, .85, 1.3, True)
        else:
            rect(-2, 2, 6.9, 7.4, B)
            win(0, 1.8, 1.4, 4.2, True); win(0, 8.1, 1.2, 2.2, True)
            rect(-2, 2, 11.1, 11.4, WD)
    elif slot == 'cy':
        tex('lime', -2, 2, 0, 11.6); tex('basalt', -2, 2, -2.4, 0.3)
        band(4.7, .14); band(8.3, .14)
        win(0, 1.5, 1.1, 2.4, 'dim', P); win(-.9, 5.4, .9, 1.8, True, P); win(.9, 5.4, .9, 1.8, 'dim', P)
        win(-.9, 9.0, .8, 1.3, True, P); win(.9, 9.0, .8, 1.3, False, P)
        rect(-2, 2, 11.3, 11.6, WD)
    elif slot == 'wr':
        tex('basalt', -2, 2, -2.4, 3.6); tex('tufa', -2, 2, 3.84, 6.2); rect(-2, 2, 3.6, 3.84, P)
        rect(-1.4, 1.4, 0, 3.0, (40, 36, 34)); rect(-.7, .7, 4.1, 5.8, (128, 92, 62)); rect(-2, 2, 5.9, 6.2, WD)
    elif slot == 'turret':
        tex('tufa', -1, 1, 1.2, 14.2); tex('basalt', -1, 1, -2.4, 1.2)
        for yy in (4.7, 8.3, 11.9): rect(-1, 1, yy, yy + .2, B)
        for k, yy in enumerate((2.6, 5.6, 8.9, 12.4)): rect(-.12, .12, yy, yy + .9, DK, DIM)
        a_ = np.asarray(im, np.float32)
        xs = (np.arange(w) - w / 2) / (pxm * 1.0)
        f = np.clip(1 - .45 * np.clip(np.abs(xs), 0, 1) ** 2, .5, 1)
        im = Image.fromarray(np.clip(a_ * f[None, :, None], 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    elif slot == 'tower':
        top = 22.8
        tex('tufa', -4, 4, 3.0, 19.2); tex('basalt', -4, 4, 0, 3.0)
        for k in range(1, 6): band(1.2 + 3.6 * k - .14, .28)
        for k in range(1, 5): win(0, 1.2 + 3.6 * k + .9, 1.0, 1.8, True if k % 2 else 'dim', B)
        rect(-3.4, 3.4, 19.5, 22.4, (74, 54, 42), (90, 60, 26))
        for k in range(15): rect(-3.4, 3.4, 19.5 + k * .19, 19.54 + k * .19, (126, 92, 64))
        rect(-.2, .2, 19.5, 22.4, WD); rect(-4, 4, 22.5, 22.8, WD); rect(-4, 4, 19.2, 19.5, P)
    # above the painted eave the slot was left BLACK (the card never samples it, but its mips
    # bleed into the eave line): edge-extend the topmost painted row upward
    a0 = np.asarray(im, np.float32)
    rows = np.where(a0.reshape(h, -1).max(1) > 0)[0]
    if len(rows) and rows[0] > 0:
        a0[:rows[0]] = a0[rows[0] + 1]
        im = Image.fromarray(a0.astype(np.uint8))
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(.4)), np.float32)
    an = np.asarray(imn.filter(ImageFilter.GaussianBlur(.5)), np.float32)
    g = A.ELEV['gutter']
    sheet[y:y + h, x:x + w] = a; night[y:y + h, x:x + w] = an
    sheet[y:y + h, x - g:x] = a[:, :1]; sheet[y:y + h, x + w:x + w + g] = a[:, -1:]
    night[y:y + h, x - g:x] = an[:, :1]; night[y:y + h, x + w:x + w + g] = an[:, -1:]
    sheet[y - g:y, x - g:x + w + g] = sheet[y:y + 1, x - g:x + w + g]
    sheet[y + h:y + h + g, x - g:x + w + g] = sheet[y + h - 1:y + h, x - g:x + w + g]
    night[y - g:y, x - g:x + w + g] = 0


def elevation_ltshaft(sheet, night):
    """The Long Tower's shaft face (12 m x local y 8.1..21.2) for lt_shell_l1: tufa, the wide
    basalt bands at 11.4, 15.0, 18.6, two narrow windows a storey (the builder's numbers)."""
    x, y, w, h = R('elev_ltshaft')
    pxm = w / 12.0; y0m, y1m = 8.1, 21.2
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    imn = Image.new('RGB', (w, h)); dn = ImageDraw.Draw(imn)
    t = strip_small(sheet, 'tufa', pxm, 16, metres_w_out=12.0).crop((0, 0, w, h)); im.paste(t, (0, 0))
    assert t.size == (w, h)
    X = lambda m: int(round((m + 6) * pxm)); Y = lambda m: h - int(round((m - y0m) * h / (y1m - y0m)))
    B = tuple(int(c) for c in PAL['basalt']); P = tuple(int(c) for c in PAL['pale'])
    for yy in (11.4, 15.0, 18.6):
        d.rectangle([0, Y(yy + .25), w, Y(yy - .25)], fill=B)
    for k, ys in enumerate((8.1, 11.4, 15.0, 18.6)):
        for xx in (-2.4, 2.4):
            d.rectangle([X(xx - .45), Y(ys + 1.0 + 1.8 + .3), X(xx + .45), Y(ys + 1.0 + 1.8)], fill=B)
            d.rectangle([X(xx - .35), Y(ys + 1.0 + 1.8), X(xx + .35), Y(ys + 1.0)], fill=(34, 40, 46))
            dn.rectangle([X(xx - .35), Y(ys + 1.0 + 1.8), X(xx + .35), Y(ys + 1.0)], fill=(255, 196, 110) if (k + int(xx > 0)) % 2 else (120, 80, 38))
    for xx in (-6, 6):
        for k in range(26):
            yy = y0m + k * .5
            if k % 2 == 0: d.rectangle([X(xx - (.55 if xx < 0 else -.55)) if xx < 0 else X(xx - .55), Y(yy + .5), X(xx + .55) if xx < 0 else X(xx), Y(yy)], fill=P)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(.4)), np.float32)
    sheet[y:y + h, x:x + w] = a; night[y:y + h, x:x + w] = np.asarray(imn.filter(ImageFilter.GaussianBlur(.5)), np.float32)
    # the 8 px edge-extended gutter, as every elevation slot has (bilinear never reaches black)
    g = A.ELEV['gutter']
    sheet[y:y + h, x - g:x] = a[:, :1]; sheet[y:y + h, x + w:x + w + g] = a[:, -1:]
    sheet[y - g:y, x - g:x + w + g] = sheet[y:y + 1, x - g:x + w + g]
    sheet[y + h:y + h + g, x - g:x + w + g] = sheet[y + h - 1:y + h, x - g:x + w + g]


# ------------------------------------------------------------------ the sheets
def facade():
    sheet = np.zeros((H, W, 3), np.float32)
    night = np.zeros((H, W, 3), np.float32)
    sheet[:] = PAL['tufa']
    put_strip(sheet, 'tufa', strip_tufa())
    put_strip(sheet, 'basalt', strip_basalt())
    put_strip(sheet, 'lime', strip_lime())
    put_strip(sheet, 'pale', strip_pale())
    put_strip(sheet, 'pantile', strip_pantile())
    put_strip(sheet, 'timber', strip_timber())
    sheet[A.R0:] = PAL['tufa'] * .9
    paint_glass(sheet, night, 'glass_tall', cols=1, rows=3)
    paint_glass(sheet, night, 'glass_tall_d', cols=1, rows=3, dim=.42)
    paint_grille(sheet, night, 'glass_high')
    paint_glass(sheet, night, 'glass_sq', cols=1, rows=2)
    paint_shop(sheet, night, 'glass_shop')
    paint_glass(sheet, night, 'glass_loggia', cols=1, rows=4)
    paint_glass(sheet, night, 'glass_hall', cols=3, rows=7, kind='plain', frame=np.array([64, 56, 50], np.float32))
    paint_glass(sheet, night, 'glass_oriel', cols=2, rows=4, kind='plain', frame=np.array([60, 52, 46], np.float32), dim=.8)
    paint_door(sheet, 'door', np.array([222, 208, 186], np.float32))     # neutral: door_leaf is tinted
    paint_door(sheet, 'door_oak', PAL['oak'] * 1.05)                      # the bays' and shells' own oak
    paint_shutter(sheet, 'shutter')
    paint_louvre(sheet, night, 'louvre', False)
    paint_louvre(sheet, night, 'louvre_shut', True)
    paint_loft(sheet, 'loft')
    paint_goods(sheet, night, 'goods')
    paint_books(sheet, 'books')
    paint_rock(sheet, 'rock')
    paint_sign(sheet, 'sign_quill', 'quill'); paint_sign(sheet, 'sign_cup', 'cup'); paint_sign(sheet, 'sign_key', 'key')
    paint_leafy(sheet, 'leaf', (78, 122, 58), accent=[((232, 197, 71), 10, 5)])
    paint_leafy(sheet, 'flowers', (70, 110, 56), accent=[((206, 52, 60), 14, 4), ((230, 120, 150), 8, 3), ((240, 236, 220), 6, 3)], seed=56)
    paint_leafy(sheet, 'vine', (74, 116, 60), n=320, seed=57, size=(4, 9))
    x, y, w, h = R('bark'); sheet[y:y + h, x:x + w] = np.array([104, 84, 64], np.float32) * (1 + .15 * cloud(h, w, 8, 3, 2))[..., None]
    paint_scorch(sheet, 'scorch')
    # A-13: two more soot shapes, a stack's lip, the yard's second cloths, a window from inside
    paint_tongues(sheet, 'scorch_b', [(.38, .24, .8, .08), (.7, .15, .55, -.05)], 82)
    paint_tongues(sheet, 'scorch_c', [(.28, .18, .5, -.06), (.6, .24, .7, .07)], 83, smear=.32)
    paint_scorch_lip(sheet, 'scorch_lip')
    paint_linen_b(sheet, 'linen_b')
    paint_glass_in(sheet, 'glass_in')
    paint_board(sheet, 'board')
    paint_plaque(sheet, 'plaque')
    paint_plaque_moon(sheet, 'plaque_moon'); paint_plaque_lemon(sheet, 'plaque_lemon')
    paint_cotto(sheet, 'cotto')
    # LOOK PASS M2: the foliage and the dressing variants
    paint_foliage(sheet, 'foliage'); paint_foliage(sheet, 'foliage_lemon', lemons=True, seed=62)
    paint_ivy(sheet, 'ivy')
    paint_flowery(sheet, 'wisteria', [(70, 104, 54), (104, 140, 70), (150, 176, 96)], [((168, 140, 214), 3), ((196, 176, 228), 2)],
                  seed=64, size=(7, 13), nf=26, racemes=True)
    paint_flowery(sheet, 'roses', [(44, 76, 42), (66, 106, 54), (100, 140, 70)], [((226, 120, 150), 3), ((246, 232, 214), 2), ((200, 70, 96), 1)],
                  seed=65, size=(5, 9), fsize=(3.5, 5.5), nf=34, shape='round')
    paint_flowery(sheet, 'flowers_b', [(70, 96, 70), (96, 124, 86), (136, 160, 112)], [((150, 124, 196), 4), ((244, 242, 232), 2), ((120, 96, 170), 1)],
                  seed=66, size=(4, 8), fsize=(2, 3.5), nf=90)
    paint_flowery(sheet, 'flowers_c', [(34, 62, 36), (54, 92, 50), (88, 128, 66)], [((236, 104, 140), 4), ((252, 200, 214), 2)],
                  seed=67, size=(4, 8), fsize=(3, 5), nf=40, shape='ivy')
    paint_chart(sheet, night, 'chart')
    paint_linen(sheet, 'linen'); paint_net(sheet, 'net')
    paint_eave_band(sheet, 'eave_band')
    paint_balus(sheet, 'balus')
    paint_arcade(sheet, night, 'arcade')
    paint_round(sheet, night, 'glass_round')
    SWC = {'dark': ((26, 26, 30), None), 'shade': ((60, 56, 58), None), 'soot': ((40, 36, 36), None),
           'brass_p': ((186, 148, 76), None), 'soil': ((92, 72, 50), None), 'iron': ((46, 48, 54), None),
           'lemon': (tuple(PAL['lemon']), None), 'gravel': ((206, 192, 160), None), 'oak': (tuple(PAL['oak'] * 1.1), None),
           'cloth': ((196, 186, 160), None), 'water': ((44, 84, 92), None), 'moss': ((96, 112, 72), None),
           'ember': ((70, 44, 30), (230, 150, 70)), 'lit': ((250, 222, 170), (255, 210, 140)),
           'shutgreen': (tuple(PAL['shutgreen']), None), 'copper': ((88, 140, 120), None), 'red': ((132, 52, 42), None),
           'blue': ((60, 86, 120), None), 'lime_s': (tuple(PAL['lime']), None), 'char': ((30, 26, 24), None),
           'rope': ((170, 146, 104), None), 'hull': ((96, 70, 50), None), 'sail': ((222, 210, 184), None),
           'glass_s': ((40, 52, 60), (240, 180, 100)),
           # flat stand-ins for the strips on thin pieces (ridge and hip rolls, rails, curbs), so
           # they are not sliced at every tile line: the strips' MEASURED means
           'tile': (tuple(PAL['tile'] * .95), None), 'pale_s': (tuple(PAL['pale'] * .97), None),
           # a lemon tree's crown is one flat green with its baked AO (iteration 2: the leaf picture
           # projected on a lumpy sphere read as a striped melon)
           'leafg': ((74, 112, 54), None),
           # look pass M2: a terracotta pot, the dark core under a crown's clusters, wisteria lilac
           'cotta': ((176, 102, 70), None), 'leafd': ((40, 66, 36), None), 'wist': ((164, 138, 206), None),
           # S1 review (A-9): falling water, cool aqua white
           'fall': ((204, 228, 232), None)}
    for n in A.SWATCHES:
        c, l = SWC[n]
        swatch(sheet, night, n, np.array(c, np.float32), None if l is None else np.array(l, np.float32))
    for s in A.ELEV['slots']:
        elevation(sheet, night, s)
    elevation_ltshaft(sheet, night)
    # MM-1 / MM-7: the sealed room is the one dark top room in the city -- its louvre rect
    # is BLACK on the night sheet, whatever any later step painted (the module test reads it)
    x, y, w, h = R('louvre_shut'); night[y:y + h, x:x + w] = 0
    img = Image.fromarray(np.clip(sheet, 0, 255).astype(np.uint8))
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90, subsampling=0); jpg = buf.getvalue()
    with open(os.path.join(OUT, 'mc_facade.jpg'), 'wb') as f: f.write(jpg)
    nim = Image.fromarray(np.clip(night, 0, 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BOX)
    nim.save(os.path.join(OUT, 'mc_facade_night.png'), optimize=True)
    # roughness, G, 8 px cells -> 256 x 256
    r = np.full((H // 8, W // 8), int(A.ROUGH['stone'] * 255), np.uint8)
    for name, kind in (('timber', 'timber'), ('pantile', 'glaze')):
        y0, h, t, rep = A.STRIPS[name]; r[(y0 - 8) // 8:(y0 + h + 8) // 8] = int(A.ROUGH[kind] * 255)
    for n, kind in A.ROUGH_RECT.items():
        x, y, w, hh = R(n)
        r[y // 8:(y + hh + 7) // 8, x // 8:(x + w + 7) // 8] = int(A.ROUGH[kind] * 255)
    Image.fromarray(np.stack([np.zeros_like(r), r, np.zeros_like(r)], -1)).save(os.path.join(OUT, 'mc_facade_rough.png'), optimize=True)
    return jpg


def measure(jpg):
    """Region means read back from the ENCODED sheet (what ships), for the test's wash
    rules: the basalt strip, the glass rects, the timber strip, the tufa strip."""
    a = np.asarray(Image.open(io.BytesIO(jpg)).convert('RGB'), np.float32)
    def mean_strip(n):
        y0, h, t, rep = A.STRIPS[n]; return a[y0:y0 + h].reshape(-1, 3).mean(0)
    def mean_rect(n):
        x, y, w, h = R(n); return a[y:y + h, x:x + w].reshape(-1, 3).mean(0)
    out = {'basalt': mean_strip('basalt'), 'tufa': mean_strip('tufa'), 'timber': mean_strip('timber'),
           'lime': mean_strip('lime'), 'pantile': mean_strip('pantile'),
           'glass': np.mean([mean_rect(n) for n in ('glass_tall', 'glass_tall_d', 'glass_sq', 'glass_loggia', 'glass_hall')], 0)}
    res = {k: [round(float(c), 2) for c in v] for k, v in out.items()}
    # every rect's DARKEST 8 x 8 block (its mean over the three channels), read back from the
    # encoded sheet: the module test holds every slot painted -- review 2026-10-06 found the
    # Long Tower's shaft slot a third pure black, and the old test only checked rect overlap
    dark = {}
    for n, (x, y, w, h) in A.RECTS.items():
        blk = a[y:y + h - h % 8, x:x + w - w % 8]
        if blk.size == 0: continue
        m = blk.reshape(h // 8, 8, w // 8, 8, 3).mean(axis=(1, 3, 4))
        dark[n] = round(float(m.min()), 2)
    res['darkestBlock'] = dark
    return res


# ------------------------------------------------------------------ paving (makePath tex)
def normal_from(hgt, strength=2.0):
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
    n = np.stack([-gx, gy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * .5 + .5) * 255)


def paving():
    S = A.PAVE_SIZE; out = {}
    rng = np.random.default_rng(301)

    # Moonmere's own flags, setts, basalt and gravel sheets were retired 2026-10-10 (Philip
    # kept the Capital's paving, moonmere_paving.ts PAVE_SHEETS); only the garden soil, which has
    # no Capital stand-in, is painted. The four draws below are the retired gravel's, kept so the
    # soil's seeded grains come out exactly as they shipped.
    n = 9000
    rng.integers(0, S, n); rng.integers(0, S, n); rng.integers(2, 5, n); rng.normal(1, .08, n)
    # A-13 (the S3 review: the Long Garden's "bed" was troughs on setts with the lawn showing through,
    # its orchard tubs on mown lawn): worked garden SOIL -- dark crumbly earth in soft clods, a few
    # pale tufa chips and dry leaf flecks; the beds and the orchard's tree rows are laid in it
    so = np.ones((S, S, 3), np.float32) * np.array([92, 72, 52], np.float32)
    so *= (1 + .12 * cloud(S, S, 40, 351) + .08 * cloud(S, S, 10, 352, 2))[..., None]
    hs = np.clip(.5 + .5 * cloud(S, S, 12, 353, 2), 0, 1)
    so *= (.82 + .3 * hs)[..., None]
    n = 2600
    ys = rng.integers(0, S, n); xs = rng.integers(0, S, n); sz = rng.integers(2, 5, n); kind = rng.random(n)
    for yy, xx, z_, k in zip(ys, xs, sz, kind):
        c = np.array([196, 184, 152], np.float32) if k < .35 else (np.array([132, 104, 60], np.float32) if k < .55 else np.array([60, 46, 34], np.float32))
        so[yy:yy + z_, xx:xx + z_] = c * rng.normal(1, .06)
    out['pave_soil'] = (np.clip(wrapblur(so, .6), 0, 255), wrapblur(hs, 2.0))
    # the normal carries only low-frequency relief: it compresses to a fraction of a
    # detailed map, and makePath's ribbons want no more
    for name, (img, hgt) in out.items():
        # (A-13: the soil is a soft field -- q 78, to stay in O-11's folder)
        Image.fromarray(img.astype(np.uint8)).save(os.path.join(OUT, f'{name}_diff.jpg'), quality=78, subsampling=0)
        nor = normal_from(wrapblur(hgt, 1.2), 2.4)
        Image.fromarray(nor.astype(np.uint8)).save(os.path.join(OUT, f'{name}_nor.jpg'), quality=78, subsampling=2)


def leaf_sheet():
    """mc_leaf.png (A-7): the trees' own RGBA sheet (moonmere_cloister_atlas.LEAF_RECTS),
    bound to MC_Leaf and alpha-tested at runtime. The sprays are leaves on twigs with CLEAR
    texels between them -- the crown's silhouette is now the leaves', not a card's edge --
    lit from above as the nature remake's crowns are; every clear texel carries the leaf
    colour (dilated), so a mip the alpha test cuts has no dark fringe. Palette-quantised to
    keep the folder inside O-7's 7.0 MB."""
    LW, LH = A.LEAF_SIZE
    col = np.zeros((LH, LW, 3), np.float32); alp = np.zeros((LH, LW), np.float32)

    def spray(name, seed, lemons):
        x0, y0, w, h = A.LEAF_RECTS[name]
        rng = np.random.default_rng(seed)
        im = Image.new('RGB', (w, h), (58, 92, 44)); m = Image.new('L', (w, h), 0)
        d, dm = ImageDraw.Draw(im), ImageDraw.Draw(m)
        # twigs from the lower middle, forking
        twigs = []
        def branch(px, py, ang, L, depth):
            ex, ey = px + math.cos(ang) * L, py - math.sin(ang) * L
            twigs.append((px, py, ex, ey, max(1, 3 - depth)))
            if depth < 2:
                for da in (-.55, .5):
                    branch(px + (ex - px) * .55, py + (ey - py) * .55, ang + da + rng.uniform(-.2, .2), L * .62, depth + 1)
        for a in (1.25, 1.57, 1.9):
            branch(w / 2 + rng.uniform(-14, 14), h - 6, a + rng.uniform(-.15, .15), h * .62, 0)
        for (ax, ay, bx, by, wd) in twigs:
            d.line([(ax, ay), (bx, by)], fill=(84, 66, 44), width=wd); dm.line([(ax, ay), (bx, by)], fill=255, width=wd)
        # leaves along the twigs, alternate sides, larger toward the tips' middle
        cols = [(34, 58, 28), (52, 88, 40), (78, 122, 52), (118, 158, 70)]
        leaves = []
        for (ax, ay, bx, by, wd) in twigs:
            n = 7 if wd < 3 else 5
            for k in range(n):
                t = (k + .5) / n
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                base = math.atan2(-(by - ay), bx - ax)
                side = 1 if k % 2 else -1
                leaves.append((px, py, base + side * rng.uniform(.6, 1.1), rng.uniform(17, 30)))
        # the clump: leaves filling an ellipse over the twigs (a card reads as foliage, not a twig)
        for _ in range(110):
            a_, r_ = rng.uniform(0, 6.28), math.sqrt(rng.uniform(0, 1))
            leaves.append((w / 2 + math.cos(a_) * r_ * w * .4, h * .44 + math.sin(a_) * r_ * h * .36, rng.uniform(0, 6.28), rng.uniform(15, 27)))
        leaves.sort(key=lambda q: -q[1])
        for (px, py, a, L) in leaves:
            ca, sa = math.cos(a), -math.sin(a)
            wd = L * .36
            loc = [(0, 0), (L * .25, wd * .45), (L * .6, wd * .5), (L * .9, wd * .25), (L, 0), (L * .9, -wd * .25), (L * .6, -wd * .5), (L * .25, -wd * .45)]
            pts = [(px + u * ca - v * sa, py + u * sa + v * ca) for u, v in loc]
            lit = min(3, max(0, int((1 - py / h) * 2.6 + rng.uniform(-.6, .9))))
            c = np.array(cols[lit], np.float32) * rng.uniform(.9, 1.08)
            d.polygon(pts, fill=tuple(int(min(255, v)) for v in c)); dm.polygon(pts, fill=255)
            # the lit half and the midrib
            half = [pts[0], pts[1], pts[2], pts[3], pts[4]]
            d.polygon(half, fill=tuple(int(min(255, v * 1.12)) for v in c))
            d.line([pts[0], pts[4]], fill=tuple(int(v * .78) for v in c), width=1)
        if lemons:
            for _ in range(5):
                cx, cy = rng.uniform(40, w - 40), rng.uniform(h * .3, h * .85)
                rx, ry = rng.uniform(11, 14), rng.uniform(14, 18)
                d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(214, 172, 44)); dm.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
                d.ellipse([cx - rx * .8, cy - ry * .85, cx + rx * .7, cy + ry * .6], fill=(240, 204, 70))
                d.ellipse([cx - rx * .5, cy - ry * .65, cx - rx * .05, cy - ry * .15], fill=(252, 236, 150))
                d.polygon([(cx, cy - ry - 3), (cx - 2, cy - ry + 2), (cx + 2, cy - ry + 2)], fill=(150, 130, 40))
        c = np.asarray(im, np.float32); a = np.asarray(m, np.float32) / 255
        col[y0:y0 + h, x0:x0 + w] = c; alp[y0:y0 + h, x0:x0 + w] = (a > .5).astype(np.float32)

    def species(name, seed, kind):
        """A-13: the other trees' sprays (olive, cypress, oleander), the lemon spray's method at half
        size: twigs from the foot, leaves along them and a clump over them, clear between."""
        x0, y0, w, h = A.LEAF_RECTS[name]
        rng = np.random.default_rng(seed)
        P = {'olive': dict(bg=(96, 110, 84), twig=(96, 88, 74), cols=[(64, 76, 58), (96, 110, 84), (136, 148, 116), (176, 186, 156)],
                           L=(10, 16), wd=.2, n=150, rx=.42, ry=.38, cy=.46),
             'cypress': dict(bg=(36, 58, 36), twig=(70, 56, 40), cols=[(20, 36, 24), (30, 54, 32), (46, 76, 42), (66, 98, 54)],
                             L=(5, 9), wd=.55, n=420, rx=.36, ry=.46, cy=.5),
             'oleander': dict(bg=(52, 84, 46), twig=(90, 74, 56), cols=[(30, 54, 30), (46, 80, 40), (70, 108, 54), (100, 138, 70)],
                              L=(12, 18), wd=.24, n=95, rx=.42, ry=.36, cy=.46)}[kind]
        im = Image.new('RGB', (w, h), P['bg']); m = Image.new('L', (w, h), 0)
        d, dm = ImageDraw.Draw(im), ImageDraw.Draw(m)
        twigs = []
        def branch(px, py, ang, L, depth):
            ex, ey = px + math.cos(ang) * L, py - math.sin(ang) * L
            twigs.append((px, py, ex, ey, max(1, 2 - depth)))
            if depth < 2:
                for da in (-.55, .5):
                    branch(px + (ex - px) * .55, py + (ey - py) * .55, ang + da + rng.uniform(-.2, .2), L * .62, depth + 1)
        for a in ((1.45, 1.57, 1.7) if kind == 'cypress' else (1.25, 1.57, 1.9)):
            branch(w / 2 + rng.uniform(-7, 7), h - 3, a + rng.uniform(-.12, .12), h * (.7 if kind == 'cypress' else .62), 0)
        for (ax, ay, bx, by, wd) in twigs:
            d.line([(ax, ay), (bx, by)], fill=P['twig'], width=wd); dm.line([(ax, ay), (bx, by)], fill=255, width=wd)
        leaves = []
        for (ax, ay, bx, by, wd) in twigs:
            for k in range(6):
                t = (k + .5) / 6
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                base = math.atan2(-(by - ay), bx - ax)
                leaves.append((px, py, base + (1 if k % 2 else -1) * rng.uniform(.5, 1.0), rng.uniform(*P['L'])))
        for _ in range(P['n']):
            a_, r_ = rng.uniform(0, 6.28), math.sqrt(rng.uniform(0, 1))
            leaves.append((w / 2 + math.cos(a_) * r_ * w * P['rx'], h * P['cy'] + math.sin(a_) * r_ * h * P['ry'],
                           rng.uniform(1.2, 1.95) if kind == 'cypress' else rng.uniform(0, 6.28), rng.uniform(*P['L'])))
        leaves.sort(key=lambda q: -q[1])
        for (px, py, a, L) in leaves:
            ca, sa = math.cos(a), -math.sin(a)
            wd = L * P['wd']
            loc = [(0, 0), (L * .25, wd * .45), (L * .6, wd * .5), (L * .9, wd * .25), (L, 0), (L * .9, -wd * .25), (L * .6, -wd * .5), (L * .25, -wd * .45)]
            pts = [(px + u * ca - v * sa, py + u * sa + v * ca) for u, v in loc]
            lit = min(3, max(0, int((1 - py / h) * 2.6 + rng.uniform(-.6, .9))))
            c = np.array(P['cols'][lit], np.float32) * rng.uniform(.9, 1.08)
            d.polygon(pts, fill=tuple(int(min(255, v)) for v in c)); dm.polygon(pts, fill=255)
            if kind == 'olive':
                # the silver underside: a pale line along the leaf
                d.line([pts[0], pts[4]], fill=tuple(int(min(255, v * 1.25)) for v in c), width=1)
        if kind == 'oleander':
            # flower heads at the twigs' tips and over the clump: five-petal pinks in clusters
            heads = [(bx, by) for (ax, ay, bx, by, wd) in twigs if wd == 1][:9]
            for _ in range(5):
                heads.append((rng.uniform(22, w - 22), rng.uniform(h * .2, h * .6)))
            for (hx, hy) in heads:
                for _ in range(5):
                    fx_, fy_ = hx + rng.uniform(-6, 6), hy + rng.uniform(-5, 5)
                    r = rng.uniform(2.6, 3.6)
                    col_ = (236, 112, 150) if rng.random() < .65 else (250, 176, 198)
                    for k in range(5):
                        aa = k * 1.2566 + rng.uniform(0, .3)
                        px_, py_ = fx_ + math.cos(aa) * r * .7, fy_ + math.sin(aa) * r * .7
                        d.ellipse([px_ - r * .55, py_ - r * .55, px_ + r * .55, py_ + r * .55], fill=col_); dm.ellipse([px_ - r * .55, py_ - r * .55, px_ + r * .55, py_ + r * .55], fill=255)
                    d.ellipse([fx_ - 1, fy_ - 1, fx_ + 1, fy_ + 1], fill=(250, 230, 160))
        if kind == 'olive':
            for _ in range(7):
                cx, cy = rng.uniform(20, w - 20), rng.uniform(h * .35, h * .8)
                d.ellipse([cx - 2.5, cy - 3.2, cx + 2.5, cy + 3.2], fill=(52, 50, 44)); dm.ellipse([cx - 2.5, cy - 3.2, cx + 2.5, cy + 3.2], fill=255)
        c = np.asarray(im, np.float32); a = np.asarray(m, np.float32) / 255
        col[y0:y0 + h, x0:x0 + w] = c; alp[y0:y0 + h, x0:x0 + w] = (a > .5).astype(np.float32)

    def opaque(name, base, seed, kind):
        x0, y0, w, h = A.LEAF_RECTS[name]
        rng = np.random.default_rng(seed)
        g = np.ones((h, w, 3), np.float32) * hexc(base)
        n = cloud(h, w, 16, seed)
        g *= (1 + .08 * n)[..., None]
        if kind == 'bark':
            for _ in range(26):
                xx = int(rng.uniform(0, w)); g[:, xx:xx + 1] *= .72
            g *= (1 + .06 * rng.standard_normal((h, w)))[..., None]
        elif kind == 'tub':
            g[int(h * .82):] = hexc('#5E6C86') * (1 + .06 * n[int(h * .82):])[..., None]
            for yy in (int(h * .3), int(h * .6)):
                g[yy:yy + 1] *= .9
        elif kind in ('soil', 'fruit', 'leafd', 'twig', 'cotta'):
            g *= (1 + .1 * rng.standard_normal((h, w)))[..., None]
        # the opaque rects' 8 px gutter: their own edge carried out (no seam at a mip)
        col[y0:y0 + h, x0:x0 + w] = np.clip(g, 0, 255); alp[y0:y0 + h, x0:x0 + w] = 1
        ex0, ey0, ex1, ey1 = max(0, x0 - 8), max(0, y0 - 8), min(LW, x0 + w + 8), min(LH, y0 + h + 8)
        for yy in range(ey0, ey1):
            for xx in (list(range(ex0, x0)) + list(range(x0 + w, ex1))):
                col[yy, xx] = col[min(max(yy, y0), y0 + h - 1), min(max(xx, x0), x0 + w - 1)]; alp[yy, xx] = 1
        for yy in list(range(ey0, y0)) + list(range(y0 + h, ey1)):
            for xx in range(x0, x0 + w):
                col[yy, xx] = col[min(max(yy, y0), y0 + h - 1), xx]; alp[yy, xx] = 1

    spray('spray', 71, False); spray('spray_lemon', 72, True)
    species('spray_olive', 73, 'olive'); species('spray_cypress', 74, 'cypress'); species('spray_oleander', 75, 'oleander')
    opaque('bark', '#6E6152', 81, 'bark'); opaque('tub', '#E4D6B2', 82, 'tub'); opaque('cotta', '#B86A44', 83, 'cotta')
    opaque('soil', '#3E3326', 84, 'soil'); opaque('fruit', '#E6C24A', 85, 'fruit'); opaque('leafd', '#2C4626', 86, 'leafd')
    opaque('twig', '#5A4834', 87, 'twig')
    # dilate the leaf colour into the clear texels (no dark fringe under the alpha test)
    cw = np.stack([col[..., k] * alp for k in range(3)], -1)
    for r in (2, 6, 14):
        acc = np.asarray(Image.fromarray(np.clip(cw, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32)
        aa = np.asarray(Image.fromarray((alp * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
        fill = acc / np.maximum(aa[..., None], 1e-3)
        hole = (alp < .5) & (aa > .02)
        col[hole] = fill[hole]
    rgba = np.dstack([np.clip(col, 0, 255), alp * 255]).astype(np.uint8)
    im = Image.fromarray(rgba).quantize(colors=255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(os.path.join(OUT, 'mc_leaf.png'), optimize=True)
    return os.path.getsize(os.path.join(OUT, 'mc_leaf.png'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    A.check()
    if '--leaf-only' in sys.argv:
        print('leaf sheet', leaf_sheet(), 'bytes'); sys.exit(0)
    jpg = facade()
    paving()
    leaf_sheet()
    lay = A.layout_json()
    lay['measured'] = measure(jpg)
    lay['measuredFrom'] = {'file': 'mc_facade.jpg', 'sha256': hashlib.sha256(jpg).hexdigest()}
    with open(os.path.join(OUT, 'mc_facade.json'), 'w') as f:
        json.dump(lay, f, indent=1)
    print('painted', OUT, 'facade', len(jpg), 'bytes; measured', lay['measured'])
