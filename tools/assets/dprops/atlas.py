# The dungeon props' ONE shared atlas: every original prop (build_dungeon_props.mjs)
# draws with one material whose sheets are painted here, procedural and original
# (no photo, no kit atlas). DUNGEON-PROPS.md is the guide.
#
#   python3 tools/assets/dprops/atlas.py            # writes client/public/models/dprops/dprops_atlas_*
#   python3 tools/assets/dprops/atlas.py --preview [out.jpg]  # also a labelled preview (default tmp/dungeons/polish/props/atlas_preview.jpg)
#
# Layout: atlas_regions.json (the generator reads the same table to write UVs).
# 2048 px at 256 px per metre: six wood STRIPS 4 m x 0.5 m with the grain along
# U (x), 48 CELLS 1 m x 1 m (metals, cloths, ceramics, paper, stone, food...),
# 16 SWATCHES. A face's UVs are fitted INSIDE its region (never wrapped), so
# nothing tiles and no seam is ever drawn; `inset` keeps mip filtering off the
# neighbours. The pkgA*/pkgB*/pkgC* cells belong to the three family packages:
# each paints its own in pkg_<a|b|c>_paint.py (paint(name, h, w, T) -> albedo,
# height or None), so no package edits this file.
#
# Sheets: albedo (sRGB JPEG), OpenGL normal from a painted height (JPEG),
# specular level in RGB with gloss in alpha (PNG, 1024), emissive (JPEG, 512:
# only the `emit` cell and the `flame`/`ember` swatches are lit).
#
# Albedos are the material's own colour, not a neutral to be tinted: a prop's
# vertex colour carries plank-to-plank tone, contact shade and dye (wool,
# velvet, glazed are near-white for dyeing), and the instance colour the
# theme's tint. DETERMINISTIC: fixed seeds; the same source writes the same bytes.
import sys, os, json, importlib
import numpy as np
from numpy.fft import rfft2, irfft2
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'client', 'public', 'models', 'dprops')
TAB = json.load(open(os.path.join(HERE, 'atlas_regions.json')))
S = TAB['size']


# ------------------------------------------------------------------ tools
def fnoise(h, w, sx, sy, seed, power=2.0):
    """Periodic 1/f noise with features ~sx px wide in x and ~sy px in y, 0..1."""
    r = np.random.default_rng(seed)
    F = rfft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None] * max(sy, 0.5)
    fx = np.fft.rfftfreq(w)[None, :] * max(sx, 0.5)
    f = np.sqrt(fx * fx + fy * fy)
    filt = 1.0 / (1.0 + f ** power * 40.0)
    filt[0, 0] = 0
    n = irfft2(F * filt, s=(h, w))
    n -= n.min()
    return n / (n.max() + 1e-9)


def mix(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def rgb(h, w, c):
    return np.ones((h, w, 3)) * np.array(c, dtype=float)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def dents(h, w, n, rmin, rmax, seed):
    """n round dents (hammer marks, pits), as a 0..1 depth map"""
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.zeros((h, w))
    for _ in range(n):
        cx, cy, rad = r.uniform(0, w), r.uniform(0, h), r.uniform(rmin, rmax)
        dd = np.hypot(xx - cx, yy - cy) / rad
        d = np.maximum(d, np.clip(1 - dd * dd, 0, 1))
    return d


class Tools:
    fnoise = staticmethod(fnoise); mix = staticmethod(mix); rgb = staticmethod(rgb)
    smooth = staticmethod(smooth); dents = staticmethod(dents)


# ------------------------------------------------------------------ wood
WOOD = {
    #            light              dark               rings  knots  weathered
    'oak':       ((.54, .42, .30), (.36, .26, .17), 15, 0, False),
    'oak_dark':  ((.36, .24, .15), (.20, .12, .07), 15, 0, False),
    'pine':      ((.64, .52, .37), (.45, .33, .21), 14, 5, False),
    'weathered': ((.56, .52, .46), (.33, .30, .26), 11, 2, True),
    'beech':     ((.68, .55, .41), (.52, .40, .28), 10, 0, False),
    'walnut':    ((.42, .25, .16), (.24, .13, .08), 12, 0, False),
}


def paint_wood(name, h, w, seed):
    light, dark, rings, knots, weathered = WOOD[name]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    # growth rings seen on a flat-sawn face: long streaks along the grain that
    # drift across it and open into the odd cathedral arch. The drift is a sum
    # of slow sines in x (whole periods over the strip), fanning a little with y.
    # Gentle: a door's field or a drawer front shows a 0.3-0.5 m window of the
    # strip, and a steeper drift read there as grain running diagonally
    r0 = np.random.default_rng(seed)
    def slow(kmax, amp):
        out = np.zeros(w)
        for k in range(1, kmax + 1):
            out += r0.normal() / k ** 1.3 * np.sin(2 * np.pi * k * np.arange(w) / w + r0.uniform(0, 6.3))
        return out / (np.abs(out).max() + 1e-9) * amp
    warp = slow(4, 1.0)[None, :] * h * .13 + slow(3, 1.0)[None, :] * (yy - h / 2) * .16
    t = (yy + warp) / h * rings
    # knots: the rings swirl round an eye
    kn = np.zeros((h, w))
    r = np.random.default_rng(seed + 7)
    for _ in range(knots):
        cx, cy, rad = r.uniform(0, w), r.uniform(10, h - 10), r.uniform(7, 15)
        d = np.hypot((xx - cx) / 2.2, yy - cy)
        t += 1.1 * np.exp(-(d / (rad * 2.6)) ** 2) * np.sign(yy - cy)
        kn = np.maximum(kn, smooth(1.0, .55, np.hypot((xx - cx) / 1.5, yy - cy) / rad))
    ring = np.abs(((t % 1.0) - .5) * 2)                 # 0 at a ring, 1 mid-band
    late = smooth(.62, .96, 1 - ring)                    # the dark latewood line
    streak = fnoise(h, w, 900, 1.4, seed + 2)
    fine = fnoise(h, w, 90, .8, seed + 3)
    pores = .5 * (fnoise(h, w, 6, .6, seed + 4) > .8) * fnoise(h, w, 40, 2, seed + 5)
    tone = .32 * late + .45 * (streak - .5) + .22 * (fine - .5) + .25 * pores + .9 * kn
    tone = np.clip(.45 + tone * .9 - .2, 0, 1)
    col = mix(rgb(h, w, light), rgb(h, w, dark), tone)
    col *= (.92 + .16 * fnoise(h, w, 300, 80, seed + 6))[..., None]
    height = .5 - .35 * late + .2 * (fine - .5) - .5 * pores - .4 * kn
    if weathered:
        cracks = smooth(.86, .95, fnoise(h, w, 500, 1.2, seed + 8)) * smooth(.4, .7, fnoise(h, w, 120, 30, seed + 9))
        silver = fnoise(h, w, 200, 30, seed + 10)
        col = mix(col, rgb(h, w, (.62, .60, .56)), .35 * silver)
        col = mix(col, rgb(h, w, (.08, .07, .06)), cracks * .85)
        height = height + .6 * (fine - .5) - 1.2 * cracks
    return col, height


def paint_endgrain(h, w, seed):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    cx, cy = w * .42, h * .55
    rr = np.hypot(xx - cx, yy - cy) + (fnoise(h, w, 30, 30, seed) - .5) * 9
    ring = np.abs(((rr / 7.0) % 1.0 - .5) * 2)
    ang = np.arctan2(yy - cy, xx - cx)
    rays = smooth(.92, .99, np.abs(np.sin(ang * 23 + fnoise(h, w, 60, 60, seed + 1) * 3)))
    saw = .5 + .5 * np.sin(xx * .9 + yy * .25 + fnoise(h, w, 80, 6, seed + 2) * 6)
    tone = .55 * smooth(.6, .95, 1 - ring) + .2 * rays + .12 * saw
    col = mix(rgb(h, w, (.62, .47, .31)), rgb(h, w, (.38, .26, .15)), np.clip(tone, 0, 1))
    return col, .5 - .3 * smooth(.6, .95, 1 - ring) + .1 * saw - .5 * rays


def paint_bark(h, w, seed):
    # warm grey-brown plates over darker fissures: a log or a stem
    # must read as bark in a dungeon's low light, not as a black tube (mean ~0.33)
    f = fnoise(h, w, 8, 90, seed)                      # long vertical fissures
    ridges = smooth(.35, .7, f) * (.45 + .55 * smooth(.3, .5, fnoise(h, w, 22, 7, seed + 4)))   # broken across into plates
    col = mix(rgb(h, w, (.33, .25, .17)), rgb(h, w, (.64, .53, .40)), ridges)
    col *= (.85 + .3 * fnoise(h, w, 30, 30, seed + 1))[..., None]
    lichen = smooth(.66, .82, fnoise(h, w, 60, 60, seed + 2)) * .35
    col = mix(col, rgb(h, w, (.42, .44, .30)), lichen * ridges)
    return col, ridges + .2 * fnoise(h, w, 4, 20, seed + 3)


# ------------------------------------------------------------------ metal
def paint_metal(name, h, w, seed):
    base = {'iron': (.25, .25, .26), 'iron_rust': (.34, .20, .12), 'brass': (.66, .48, .22), 'gold': (.86, .66, .28),
            'steel': (.56, .57, .58), 'pewter': (.46, .46, .45), 'iron_flat': (.2, .2, .21)}[name]
    m = fnoise(h, w, 40, 40, seed)
    hammer = dents(h, w, 70, 6, 16, seed + 1)
    pits = (fnoise(h, w, 2, 2, seed + 2) > .82).astype(float)
    col = rgb(h, w, base) * (.82 + .3 * m)[..., None]
    col *= (1 - .04 * hammer)[..., None]
    height = .5 - .35 * hammer - .25 * pits + .1 * m
    if name in ('iron', 'iron_rust'):
        rust = smooth(.6 if name == 'iron' else .3, .85, fnoise(h, w, 25, 25, seed + 3))
        col = mix(col, rgb(h, w, (.42, .22, .10)), rust * (.55 if name == 'iron' else .9))
        col = mix(col, rgb(h, w, (.05, .05, .05)), pits * .6)
    if name in ('brass', 'gold'):
        tarnish = smooth(.55, .85, fnoise(h, w, 30, 30, seed + 4))
        col = mix(col, rgb(h, w, (.28, .26, .14) if name == 'brass' else (.5, .36, .14)), tarnish * .55)
    if name == 'steel':
        brush = fnoise(h, w, 300, 1, seed + 5)
        col *= (.9 + .2 * brush)[..., None]
        height = height + .15 * brush
    return col, height


# ------------------------------------------------------------------ cloth, leather, rope, paper
def weave(h, w, period, seed, jitter=.25):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    jx = (fnoise(h, w, 50, 4, seed) - .5) * period * jitter
    jy = (fnoise(h, w, 4, 50, seed + 1) - .5) * period * jitter
    warp = .5 + .5 * np.sin((xx + jx) / period * np.pi * 2)
    weft = .5 + .5 * np.sin((yy + jy) / period * np.pi * 2)
    over = (np.floor((xx + jx) / period) + np.floor((yy + jy) / period)) % 2
    return np.where(over > 0, warp, weft) * .6 + .4 * warp * weft


def paint_cloth(name, h, w, seed):
    if name == 'linen':
        wv = weave(h, w, 3.0, seed); col = rgb(h, w, (.80, .76, .66))
    elif name == 'burlap':
        # jute's threads are ~3 mm, under a pixel here: a fine open weave
        # (2.6 px = 1 cm) carries the texture, and the slubs (thick and thin
        # threads running the length of warp and weft) make it read as cloth;
        # the old 2.7 cm weave read as basketwork
        wv = weave(h, w, 2.6, seed, .35); col = rgb(h, w, (.60, .49, .33))
    elif name == 'wool':
        wv = weave(h, w, 4.0, seed, .2); col = rgb(h, w, (.86, .84, .80))
    else:  # velvet: a soft pile, no visible weave
        wv = .5 + .5 * fnoise(h, w, 3, 3, seed); col = rgb(h, w, (.82, .80, .78))
    blot = fnoise(h, w, 50, 50, seed + 3)
    col = col * (.78 + .22 * wv + .1 * (blot - .5))[..., None]
    if name == 'burlap':
        warp_s = fnoise(h, w, 1.2, 70, seed + 4) - .5     # thread to thread along the warp (y) and the weft (x)
        weft_s = fnoise(h, w, 70, 1.2, seed + 5) - .5
        slub = smooth(.78, .95, fnoise(h, w, 1.5, 40, seed + 6)) + smooth(.78, .95, fnoise(h, w, 40, 1.5, seed + 7))
        col = col * (1 + .16 * (warp_s + weft_s) + .07 * slub)[..., None]
        return col, wv * .45 + .25 * (warp_s + weft_s + 1) + .2 * slub + .1 * blot
    return col, wv * .7 + .3 * blot


def paint_leather(h, w, seed):
    peb = fnoise(h, w, 3, 3, seed)
    cells = smooth(.4, .6, fnoise(h, w, 6, 6, seed + 1))
    scuff = smooth(.65, .9, fnoise(h, w, 50, 15, seed + 2))
    col = rgb(h, w, (.40, .24, .14)) * (.8 + .25 * cells + .1 * peb)[..., None]
    col = mix(col, rgb(h, w, (.55, .40, .28)), scuff * .5)
    return col, .4 * cells + .3 * peb - .2 * scuff


def paint_rope(h, w, seed):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    strand = .5 + .5 * np.sin((xx + yy * .9) / 18 * np.pi * 2)        # three-strand lay along U
    fib = fnoise(h, w, 30, 1, seed)
    col = rgb(h, w, (.62, .51, .34)) * (.55 + .45 * strand + .15 * (fib - .5))[..., None]
    return col, strand * .8 + .2 * fib


def paint_paper(name, h, w, seed):
    blot = fnoise(h, w, 60, 60, seed)
    fib = fnoise(h, w, 4, 4, seed + 1)
    col = rgb(h, w, (.86, .79, .62)) * (.88 + .12 * fib - .12 * smooth(.6, .9, blot))[..., None]
    col = mix(col, rgb(h, w, (.62, .48, .30)), smooth(.75, .95, blot) * .5)    # foxing
    height = .5 + .1 * fib
    if name == 'paper_edge':      # the side of a stack of leaves: fine lines along U
        yy = np.mgrid[0:h, 0:w][0].astype(float)
        lines = .5 + .5 * np.sin(yy * 1.9 + fnoise(h, w, 80, 3, seed + 2) * 4)
        col = col * (.75 + .25 * lines)[..., None]
        height = lines
    if name == 'label':           # ink: lines of writing on parchment
        img = Image.new('L', (w, h), 0); d = ImageDraw.Draw(img); r = np.random.default_rng(seed + 3)
        for y in range(14, h - 10, 13):
            x = 14
            while x < w - 20:
                ln = int(r.integers(8, 34))
                d.line([(x, y + r.integers(-1, 2)), (x + ln, y + r.integers(-1, 2))], fill=int(r.integers(140, 230)), width=2)
                x += ln + int(r.integers(4, 9))
        ink = np.asarray(img, dtype=float) / 255
        col = mix(col, rgb(h, w, (.12, .09, .07)), ink * .85)
    return col, height


# ------------------------------------------------------------------ ceramic, glass, wax, stone
def paint_ceramic(name, h, w, seed):
    yy = np.mgrid[0:h, 0:w][0].astype(float)
    throw = .5 + .5 * np.sin(yy * .55 + fnoise(h, w, 100, 5, seed) * 5)      # throwing rings along U
    m = fnoise(h, w, 30, 30, seed + 1)
    if name == 'terracotta':
        col = rgb(h, w, (.62, .35, .22)) * (.85 + .2 * m + .06 * throw)[..., None]
        col = mix(col, rgb(h, w, (.75, .62, .48)), smooth(.65, .9, fnoise(h, w, 40, 40, seed + 2)) * .4)
    elif name == 'glazed':
        col = rgb(h, w, (.86, .84, .78)) * (.95 + .06 * m)[..., None]
        craze = smooth(.92, .97, fnoise(h, w, 2, 2, seed + 3))
        col = col * (1 - .1 * craze)[..., None]
    elif name == 'glass':
        col = rgb(h, w, (.20, .30, .25)) * (.8 + .4 * fnoise(h, w, 90, 6, seed + 4))[..., None]
    else:  # wax
        col = rgb(h, w, (.88, .82, .66)) * (.92 + .08 * m)[..., None]
        drip = smooth(.6, .9, fnoise(h, w, 4, 40, seed + 5))
        col = mix(col, rgb(h, w, (.95, .90, .78)), drip * .5)
        throw = drip
    return col, .3 * throw + .2 * m


def paint_stone(name, h, w, seed):
    m = fnoise(h, w, 20, 20, seed); s = fnoise(h, w, 2, 2, seed + 1)
    if name == 'marble':
        v = np.abs(fnoise(h, w, 90, 90, seed + 2) - .5)
        vein = smooth(.03, 0, v)
        col = rgb(h, w, (.86, .84, .80)) * (.92 + .08 * m)[..., None]
        col = mix(col, rgb(h, w, (.45, .44, .46)), vein * .7)
        return col, .5 - .2 * vein
    if name == 'bone':
        col = rgb(h, w, (.80, .74, .60)) * (.85 + .2 * m + .06 * s)[..., None]
        return col, .5 * m + .2 * s
    if name == 'plaster':
        col = rgb(h, w, (.80, .77, .71)) * (.9 + .12 * m)[..., None]
        return col, m
    col = rgb(h, w, (.54, .51, .46)) * (.8 + .25 * m + .15 * (s - .5))[..., None]
    return col, .6 * m + .3 * s


def paint_misc(name, h, w, seed):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    if name == 'straw':
        st = fnoise(h, w, 200, 1, seed); col = mix(rgb(h, w, (.78, .65, .34)), rgb(h, w, (.50, .38, .16)), smooth(.3, .8, st))
        return col, st
    if name == 'coal':
        c = fnoise(h, w, 10, 10, seed); col = rgb(h, w, (.07, .065, .06)) * (.6 + .8 * smooth(.6, .9, c))[..., None]
        return col, c
    if name == 'soot':
        c = fnoise(h, w, 30, 30, seed); return rgb(h, w, (.09, .085, .08)) * (.8 + .4 * c)[..., None], c
    if name == 'leaf':
        v = np.abs(np.sin(xx / 22 + yy / 40)); col = rgb(h, w, (.24, .38, .14)) * (.75 + .25 * fnoise(h, w, 20, 20, seed))[..., None]
        col = mix(col, rgb(h, w, (.48, .58, .26)), smooth(.95, 1, v) * .6)
        return col, v
    if name == 'produce':      # four quarters: apple skin, leaf top, root, crust
        q = np.zeros((h, w, 3)); hh, ww = h // 2, w // 2
        m = fnoise(hh, ww, 12, 12, seed)
        q[:hh, :ww] = mix(rgb(hh, ww, (.62, .10, .07)), rgb(hh, ww, (.55, .58, .18)), smooth(.55, .85, m))
        q[:hh, :ww] *= (.85 + .3 * fnoise(hh, ww, 2, 8, seed + 1))[..., None]
        q[:hh, ww:] = rgb(hh, ww, (.20, .40, .14)) * (.7 + .4 * fnoise(hh, ww, 30, 2, seed + 2))[..., None]
        q[hh:, :ww] = rgb(hh, ww, (.80, .42, .14)) * (.8 + .3 * fnoise(hh, ww, 2, 20, seed + 3))[..., None]
        q[hh:, ww:] = mix(rgb(hh, ww, (.66, .44, .22)), rgb(hh, ww, (.40, .24, .10)), fnoise(hh, ww, 14, 14, seed + 4))
        return q, fnoise(h, w, 10, 10, seed + 5)
    if name == 'spines':       # book spines: bands of colour with gilt rules, vertical (V along the spine)
        col = np.zeros((h, w, 3)); r = np.random.default_rng(seed); x = 0
        pal = [(.36, .10, .08), (.12, .20, .30), (.16, .26, .14), (.40, .28, .14), (.22, .12, .18), (.30, .22, .12), (.10, .10, .12)]
        while x < w:
            bw = int(r.integers(14, 30)); c = pal[int(r.integers(0, len(pal)))]
            col[:, x:x + bw] = c
            for gy in (int(h * .12), int(h * .2), int(h * .8), int(h * .88)):
                col[gy:gy + 3, x + 2:x + bw - 2] = (.78, .60, .26)
            col[:, x:x + 1] *= .4
            x += bw
        col *= (.8 + .3 * fnoise(h, w, 20, 20, seed + 1))[..., None]
        return col, fnoise(h, w, 6, 6, seed + 2)
    if name == 'emit':         # a lit surface (candle flame, lantern glass, coals): hot centre
        d = np.hypot((xx - w / 2) / w, (yy - h / 2) / h) * 2
        col = mix(rgb(h, w, (1.0, .92, .70)), rgb(h, w, (1.0, .55, .18)), smooth(.2, 1, d))
        return col, np.zeros((h, w))
    return rgb(h, w, (.5, .5, .5)), np.zeros((h, w))


SWATCH = {'white': (.86, .85, .82), 'black': (.05, .05, .05), 'grey': (.4, .4, .4), 'gilt_flat': (.82, .62, .26), 'red': (.45, .08, .06),
          'blue': (.10, .16, .34), 'green': (.14, .28, .12), 'iron_flat': (.2, .2, .21), 'flame': (1, .86, .55), 'ember': (1, .45, .12),
          'shadow': (.02, .02, .02), 'cream': (.86, .80, .64)}
EMIT = {'emit': 1.0, 'flame': 1.0, 'ember': .8}


def paint_region(name, kind, h, w, seed):
    if kind == 'wood': return paint_wood(name, h, w, seed)
    if name == 'endgrain': return paint_endgrain(h, w, seed)
    if name == 'bark': return paint_bark(h, w, seed)
    if name in ('iron', 'iron_rust', 'brass', 'gold', 'steel', 'pewter'): return paint_metal(name, h, w, seed)
    if name in ('linen', 'burlap', 'wool', 'velvet'): return paint_cloth(name, h, w, seed)
    if name == 'leather': return paint_leather(h, w, seed)
    if name == 'rope': return paint_rope(h, w, seed)
    if name in ('parchment', 'paper_edge', 'label'): return paint_paper(name, h, w, seed)
    if name in ('terracotta', 'glazed', 'glass', 'wax'): return paint_ceramic(name, h, w, seed)
    if name in ('stone', 'marble', 'bone', 'plaster'): return paint_stone(name, h, w, seed)
    if name.startswith('pkg'):
        mod = {'A': 'pkg_a_paint', 'B': 'pkg_b_paint', 'C': 'pkg_c_paint'}[name[3]]
        try:
            m = importlib.import_module(mod)
            got = m.paint(name, h, w, Tools)
            if got is not None: return got
        except ModuleNotFoundError:
            pass
        return rgb(h, w, (.5, .5, .5)), np.zeros((h, w))
    if kind == 'swatch':
        if name == 'iron_flat': return paint_metal('iron_flat', h, w, seed)
        return rgb(h, w, SWATCH.get(name, (.5, .5, .5))), np.zeros((h, w))
    return paint_misc(name, h, w, seed)


def normal_map(height, strength):
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(height)   # OpenGL: green up
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * .5 + .5


def main():
    sys.path.insert(0, HERE)
    alb = np.zeros((S, S, 3)); nor = np.zeros((S, S, 3)); nor[..., 2] = 1; nor = nor * .5 + .5; nor[..., 2] = 1
    spec = np.zeros((S, S, 4)); emit = np.zeros((S, S, 3))
    for k, (name, r) in enumerate(sorted(TAB['regions'].items())):
        if r['kind'] == 'sub': continue      # a named part of another region (produce_apple ...), painted with it
        x, y, w, h = r['px']
        col, height = paint_region(name, r['kind'], h, w, 1000 + k * 17)
        alb[y:y + h, x:x + w] = np.clip(col, 0, 1)
        nor[y:y + h, x:x + w] = normal_map(height, 3.0 if r['kind'] != 'swatch' else 0)
        s, g = r['spec'], r['gloss']
        lum = col.mean(-1)
        spec[y:y + h, x:x + w, :3] = np.clip(s * (.7 + .6 * lum / max(lum.mean(), 1e-3)), 0, 1)[..., None]
        spec[y:y + h, x:x + w, 3] = g
        if name in EMIT: emit[y:y + h, x:x + w] = col * EMIT[name]
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((alb * 255 + .5).astype(np.uint8)).save(os.path.join(OUT, 'dprops_atlas_diff.jpg'), quality=90, optimize=True)
    Image.fromarray((nor * 255 + .5).astype(np.uint8)).save(os.path.join(OUT, 'dprops_atlas_nor_gl.jpg'), quality=90, optimize=True)
    Image.fromarray((spec * 255 + .5).astype(np.uint8)).resize((1024, 1024), Image.BILINEAR).save(os.path.join(OUT, 'dprops_atlas_spec.png'), optimize=True)
    Image.fromarray((emit * 255 + .5).astype(np.uint8)).resize((512, 512), Image.BILINEAR).save(os.path.join(OUT, 'dprops_atlas_emit.jpg'), quality=90)
    if '--preview' in sys.argv:
        im = Image.fromarray((alb * 255 + .5).astype(np.uint8)); d = ImageDraw.Draw(im)
        for name, r in TAB['regions'].items():
            if r['kind'] == 'sub': continue
            x, y, w, h = r['px']; d.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 255, 0)); d.text((x + 4, y + 4), name, fill=(255, 255, 0))
        i = sys.argv.index('--preview')     # an optional path after the flag, so a package can preview into its own folder
        arg = sys.argv[i + 1] if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('-') else None
        p = os.path.abspath(arg) if arg else os.path.join(ROOT, 'tmp', 'dungeons', 'polish', 'props', 'atlas_preview.jpg')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        im.resize((1024, 1024)).save(p, quality=85); print('preview', p)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
