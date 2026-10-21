# Package C's atlas cells (pkgC1..pkgC3), painted into the shared dungeon-props atlas by
# atlas.py, which calls paint(name, h, w, T) for each and keeps the grey default on None.
# T is atlas.Tools: fnoise(h, w, sx, sy, seed), mix, rgb(h, w, colour), smooth, dents.
# Return (albedo HxWx3 in 0..1, height HxW) -- see atlas.py's painters for the style.
#
# All three are mapped WHOLE onto one surface (fam_textiles.mjs, fam_plants.mjs give
# st over the full 0.98 m of the cell), so each is a picture of that surface unrolled,
# not a tiling material:
#   pkgC1  the Mausoleum's banner face: blue wool, a silver galloon border, a silver
#          vigil lamp with a gilt flame in a ring, three stars under it
#   pkgC2  the Great Granary's banner face: ochre wool, a madder-red border, a
#          bound wheat sheaf in umber
#   pkgC3  a leaf, unrolled: u across (the midrib at 0.5), v from the stalk (top of the
#          cell) to the tip (bottom); veins, a paler midrib, a yellowing tip
# A banner's cell is stretched over its cloth (about 1.4 m x 2.75 m), so the banner
# designs are drawn in cloth metres (BW x BH) and squeezed into the square.
# DETERMINISTIC: fixed seeds.
import numpy as np
from PIL import Image, ImageDraw

INS = 6                    # atlas_regions.json `inset`: the UVs stay this far inside the cell
BW, BH = 1.4, 2.75         # the banner cloth the cell is stretched over (fam_textiles.mjs CLOTH)
SS = 4                     # supersampling for the drawn shapes


def _canvas(h, w):
    """a supersampled mask canvas over the cell's INTERIOR and a metres -> pixel mapper"""
    iw, ih = (w - 2 * INS) * SS, (h - 2 * INS) * SS
    img = Image.new('L', (iw, ih), 0)
    return img, ImageDraw.Draw(img), (lambda x, y: (x / BW * iw, y / BH * ih))


def _mask(img, h, w):
    """the supersampled interior mask, down to the cell (margins copy the edge)"""
    m = np.asarray(img.resize((w - 2 * INS, h - 2 * INS), Image.LANCZOS), dtype=float) / 255
    return np.pad(m, INS, mode='edge')


def _weave(h, w, period, seed, T):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    jx = (T.fnoise(h, w, 50, 4, seed) - .5) * period * .25
    jy = (T.fnoise(h, w, 4, 50, seed + 1) - .5) * period * .25
    warp = .5 + .5 * np.sin((xx + jx) / period * np.pi * 2)
    weft = .5 + .5 * np.sin((yy + jy) / period * np.pi * 2)
    over = (np.floor((xx + jx) / period) + np.floor((yy + jy) / period)) % 2
    return np.where(over > 0, warp, weft) * .6 + .4 * warp * weft


def _star(d, P, cx, cy, r, points=5, inner=.42):
    pts = []
    for k in range(points * 2):
        a = -np.pi / 2 + k * np.pi / points
        rr = r if k % 2 == 0 else r * inner
        pts.append(P(cx + np.cos(a) * rr, cy + np.sin(a) * rr))
    d.polygon(pts, fill=255)


def _ellipse(d, P, cx, cy, rx, ry, fill=255):
    a, b = P(cx - rx, cy - ry), P(cx + rx, cy + ry)
    d.ellipse([a, b], fill=fill)


def _border(h, w, inset, width):
    """the galloon band: a frame `inset` m in from the sides and the hem, `width` wide; the
    top is the band under the sleeve. Returns the band mask and a lozenge pattern in it."""
    img, d, P = _canvas(h, w)
    x0, x1, y0, y1 = inset, BW - inset, .16, BH - inset
    d.rectangle([P(x0, y0), P(x1, y1)], fill=255)
    d.rectangle([P(x0 + width, y0 + width), P(x1 - width, y1 - width)], fill=0)
    band = _mask(img, h, w)
    # lozenges along the band: a diamond every 2.4 band-widths
    img2, d2, _ = _canvas(h, w)
    step = width * 2.4
    def lozenge(cx, cy, horiz):
        rx, ry = (width * .9, width * .32) if horiz else (width * .32, width * .9)
        d2.polygon([P(cx - rx, cy), P(cx, cy - ry), P(cx + rx, cy), P(cx, cy + ry)], fill=255)
    for k in range(int((y1 - y0) / step) + 1):
        y = y0 + step * (k + .5)
        lozenge(x0 + width / 2, y, False); lozenge(x1 - width / 2, y, False)
    for k in range(int((x1 - x0) / step) + 1):
        x = x0 + step * (k + .5)
        lozenge(x, y0 + width / 2, True); lozenge(x, y1 - width / 2, True)
    return band, _mask(img2, h, w) * band


def banner_blue(h, w, T):
    seed = 7100
    wv = _weave(h, w, 3.0, seed, T)
    blot = T.fnoise(h, w, 60, 60, seed + 2)
    field = T.rgb(h, w, (.13, .19, .40)) * (.78 + .22 * wv + .14 * (blot - .5))[..., None]
    band, loz = _border(h, w, .07, .085)
    silver = T.rgb(h, w, (.74, .74, .72)) * (.72 + .28 * wv)[..., None]
    col = T.mix(field, silver, band)
    col = T.mix(col, T.rgb(h, w, (.20, .26, .48)), loz * .9)               # blue lozenges woven into the silver
    # the device: a ring, the vigil lamp in it, a gilt flame, three stars under it
    cx, cy = BW / 2, 1.05
    img, d, P = _canvas(h, w)
    ring = .36
    _ellipse(d, P, cx, cy, ring, ring); _ellipse(d, P, cx, cy, ring - .035, ring - .035, 0)
    # the lamp: a shallow bowl on a knopped stem and a spread foot
    d.polygon([P(cx - .17, cy + .02), P(cx + .17, cy + .02), P(cx + .11, cy + .10), P(cx - .11, cy + .10)], fill=255)
    d.rectangle([P(cx - .022, cy + .10), P(cx + .022, cy + .25)], fill=255)
    _ellipse(d, P, cx, cy + .175, .045, .03)
    d.polygon([P(cx - .12, cy + .30), P(cx + .12, cy + .30), P(cx + .03, cy + .245), P(cx - .03, cy + .245)], fill=255)
    d.rectangle([P(cx - .2, cy + .0), P(cx + .2, cy + .025)], fill=255)    # the rim
    for k in range(3):
        _star(d, P, cx + (k - 1) * .26, 1.72, .07)
    dev = _mask(img, h, w)
    img, d, P = _canvas(h, w)
    d.polygon([P(cx, cy - .27), P(cx + .06, cy - .12), P(cx + .075, cy - .05), P(cx + .03, cy - .005), P(cx - .03, cy - .005), P(cx - .075, cy - .05), P(cx - .06, cy - .12)], fill=255)
    flame = _mask(img, h, w)
    col = T.mix(col, silver * 1.08, dev)
    col = T.mix(col, T.rgb(h, w, (.86, .64, .24)) * (.8 + .2 * wv)[..., None], flame)
    # wear: a slight fade toward the top (the light the cloth hung in), soot at the hem
    yy = np.mgrid[0:h, 0:w][0] / h
    col = col * (1 - .18 * T.smooth(.82, 1, yy) * (.6 + .4 * blot))[..., None]
    height = .5 + .25 * wv + .35 * band + .4 * (dev + flame) - .1 * loz
    return np.clip(col, 0, 1), height


def banner_gold(h, w, T):
    seed = 7200
    wv = _weave(h, w, 3.0, seed, T)
    blot = T.fnoise(h, w, 60, 60, seed + 2)
    field = T.rgb(h, w, (.66, .47, .15)) * (.78 + .22 * wv + .14 * (blot - .5))[..., None]
    band, loz = _border(h, w, .07, .09)
    red = T.rgb(h, w, (.42, .11, .07)) * (.75 + .25 * wv)[..., None]
    col = T.mix(field, red, band)
    col = T.mix(col, T.rgb(h, w, (.74, .55, .20)), loz * .9)
    # the sheaf: stalks gathered at a band and fanning out top and bottom, ears of grain
    cx, cy = BW / 2, 1.18
    img, d, P = _canvas(h, w)
    r = np.random.default_rng(seed + 5)
    for k in range(11):
        f = (k - 5) / 5
        top = (cx + f * .30, cy - .38 - .06 * (1 - f * f)); bot = (cx + f * .16, cy + .52)
        d.line([P(*top), P(cx + f * .035, cy), P(*bot)], fill=255, width=int(.018 / BW * (w - 2 * INS) * SS))
        # the ear: grains in two rows up the last third of the stalk
        ax, ay = top; ang = np.arctan2(top[0] - cx, -(top[1] - cy))
        for g in range(6):
            t = g / 6
            px, py = ax - np.sin(ang) * (.02 + t * .15), ay + np.cos(ang) * (.02 + t * .15)
            for s in (-1, 1):
                gx, gy = px + s * np.cos(ang) * .016, py + s * np.sin(ang) * .016
                _ellipse(d, P, gx, gy, .011, .022)
        d.line([P(ax, ay), P(ax + np.sin(ang) * .08, ay - np.cos(ang) * .08)], fill=255, width=int(.006 / BW * (w - 2 * INS) * SS))
    sheaf = _mask(img, h, w)
    img, d, P = _canvas(h, w)
    d.rounded_rectangle([P(cx - .1, cy - .035), P(cx + .1, cy + .035)], radius=8, fill=255)
    tie = _mask(img, h, w)
    col = T.mix(col, T.rgb(h, w, (.30, .17, .07)) * (.8 + .2 * wv)[..., None], sheaf)
    col = T.mix(col, red * 1.1, tie)
    yy = np.mgrid[0:h, 0:w][0] / h
    col = col * (1 - .18 * T.smooth(.82, 1, yy) * (.6 + .4 * blot))[..., None]
    height = .5 + .25 * wv + .35 * band + .35 * sheaf + .45 * tie
    return np.clip(col, 0, 1), height


def leaf(h, w, T):
    """a leaf surface: u across (midrib at the centre column), v down from the stalk to the tip"""
    seed = 7300
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    u = (xx - INS) / (w - 2 * INS) * 2 - 1           # -1 .. 1 across
    v = np.clip((yy - INS) / (h - 2 * INS), 0, 1)    # 0 at the stalk, 1 at the tip
    au = np.abs(u)
    mot = T.fnoise(h, w, 18, 18, seed)
    fine = T.fnoise(h, w, 2, 2, seed + 1)
    base = np.array((.36, .56, .20))
    col = T.rgb(h, w, base) * (.86 + .2 * (mot - .5) + .08 * (fine - .5))[..., None]
    # lighter toward the margin's underside sheen, darker in the blade between veins
    col = col * (.92 + .1 * au)[..., None]
    # secondary veins: lines leaving the midrib toward the tip at ~40 degrees, every 1/9 of the length
    ph = (v - .5 * au ** .75) * 7.0 + .15 * (mot - .5)
    vein = np.clip(1 - np.abs(ph - np.round(ph)) / .07, 0, 1) * T.smooth(.04, .1, au) * (1 - T.smooth(.6, .95, au))
    mid = np.clip(1 - au / .05, 0, 1)
    pale = T.rgb(h, w, (.62, .74, .40))
    col = T.mix(col, pale, mid * .85)
    col = T.mix(col, pale * .9, vein * .3)
    # the margin a touch darker, the tip yellowing
    col = T.mix(col, col * .78, T.smooth(.88, 1, au))
    col = T.mix(col, T.rgb(h, w, (.62, .60, .22)), T.smooth(.82, 1, v) * .35 * (.5 + mot))
    height = .5 - .35 * mid - .2 * vein + .06 * fine + .1 * (1 - au)
    return np.clip(col, 0, 1), height


def paint(name, h, w, T):
    if name == 'pkgC1': return banner_blue(h, w, T)
    if name == 'pkgC2': return banner_gold(h, w, T)
    if name == 'pkgC3': return leaf(h, w, T)
    return None
