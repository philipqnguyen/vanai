# Package B's atlas cells (pkgB1..pkgB3), painted into the shared dungeon-props atlas by
# atlas.py, which calls paint(name, h, w, T) for each and keeps the grey default on None.
# T is atlas.Tools: fnoise(h, w, sx, sy, seed), mix, rgb(h, w, colour), smooth, dents.
# Return (albedo HxWx3 in 0..1, height HxW) -- see atlas.py's painters for the style.
#
# Unlike the shared cells, these three are SHEETS OF SUB-TILES that the books,
# vessels and lights families address with absolute UVs (dprops/pkgb_uv.mjs
# holds the same layout): a book's spine has to show ONE whole spine, and a band
# round an urn has to meet itself. Everything is laid out on the cell's INNER
# square (the atlas inset is 6 px a side: 244 px), and the margin repeats the
# edge so mip filtering stays clean.
#
#   pkgB1  four glaze bands of 61 px, periodic across the 244 px width (a band
#          lathe maps u 0..1 once round the pot, so it meets itself): 0 Greek
#          key, 1 running wave, 2 laurel, 3 beads. Near-white ground, so a
#          vertex dye turns it terracotta or slate and the ink stays dark.
#   pkgB2  top half a heap of struck coins seen from above (a hoard's mound),
#          bottom half coin edges stacked (a column segment maps the whole
#          half: ~37 coins).
#   pkgB3  32 book spines, 16 columns x 2 rows of 15.25 x 122 px: the top 76%
#          the spine (raised bands, gilt rules, a title label, rubbed head and
#          tail), the bottom 24% the plain cover of that same book.
import numpy as np

INNER, INS = 244, 6
SPINE_COLS, SPINE_ROWS, SPINE_SPLIT = 16, 2, 0.76

# the Greek key's unit, 6 columns x 5 rows of ink ('#'), repeated 8 times round
KEY = ['#####.',
       '#...#.',
       '#.#.#.',
       '#.#...',
       '######']


def _pad(col, height, h, w):
    """the inner square painted, the inset margin repeating its edge"""
    p = ((INS, h - INNER - INS), (INS, w - INNER - INS))
    return np.pad(col, p + ((0, 0),), mode='edge'), np.pad(height, p, mode='edge')


def _bands(T, seed):
    n = INNER
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    col = T.rgb(n, n, (.88, .85, .77)) * (.94 + .08 * T.fnoise(n, n, 20, 20, seed))[..., None]
    ink = np.zeros((n, n))
    sh = n / 4
    key = np.array([[c == '#' for c in row] for row in KEY], dtype=float)
    for k in range(4):
        ly = yy - k * sh                       # 0..61 inside the strip
        inside = (ly >= 0) & (ly < sh)
        rules = ((np.abs(ly - 6) < 1.4) | (np.abs(ly - (sh - 7)) < 1.4)).astype(float)
        mid = (ly - sh / 2) / (sh / 2 - 12)    # -1..1 between the rules (top -1)
        inb = np.abs(mid) <= 1.0
        if k == 0:     # Greek key, period 30.5 px
            u = (xx % (n / 8)) / (n / 8)
            ci = np.clip((u * 6).astype(int), 0, 5); ri = np.clip(((mid + 1) / 2 * 5).astype(int), 0, 4)
            pat = key[ri, ci]
        elif k == 1:   # running wave, period 40.7 px
            u = (xx % (n / 6)) / (n / 6)
            curve = .55 * np.sin(u * 2 * np.pi) - .15 * np.sin(u * 4 * np.pi)
            pat = (np.abs(mid - curve) < .2).astype(float)
            r = np.hypot((u - .25) * 3.2, (mid - .1))
            pat = np.maximum(pat, ((np.abs(r - .32) < .09) & (u < .5)).astype(float))
        elif k == 2:   # laurel: paired leaves on a stem, period 24.4 px
            u = (xx % (n / 10)) / (n / 10)
            stem = np.abs(mid) < .12
            def leaf(cu, cm, a):
                du, dm = (u - cu) * 2.4, mid - cm          # a strip unit is ~2.4 times as tall as a period is wide
                p, q = du * np.cos(a) + dm * np.sin(a), -du * np.sin(a) + dm * np.cos(a)
                return np.hypot(p / .5, q / .2) < 1
            pat = (stem | leaf(.32, -.42, .6) | leaf(.68, .42, .6) | (np.hypot((u - .85) * 9, (mid + .55) * 3) < 1)).astype(float)
        else:          # beads and reels between double rules, period 15.25 px
            u = (xx % (n / 16)) / (n / 16)
            bead = np.hypot((u - .5) * 2.4, mid * 1.6) < .7
            reel = (u < .06) & (np.abs(mid) < .35)
            inner = np.abs(np.abs(mid) - .92) < .1
            pat = (bead | reel | inner).astype(float)
        ink = np.maximum(ink, np.where(inside, np.maximum(pat * inb, rules), 0))
    ink = ink * (.82 + .25 * T.fnoise(n, n, 6, 6, seed + 1))     # a brushed slip, not perfectly even
    col = T.mix(col, T.rgb(n, n, (.16, .11, .08)), np.clip(ink, 0, 1))
    return col, .5 + .2 * ink


def _coins(T, seed):
    n = INNER
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    half = n // 2
    # top: a heap seen from above, coins overlapping at every tilt. A coin is
    # ~11 px across (a little over its real 3 cm at 256 px/m, so it reads), drawn
    # back to front so the last lie on top.
    col = np.zeros((n, n, 3)); col[:] = (.30, .21, .08)
    hgt = np.zeros((n, n))
    gold = np.array([.86, .66, .28])
    for _ in range(2600):
        cx, cy = rng.uniform(-4, n + 4), rng.uniform(-4, half + 4)
        r = rng.uniform(4.6, 6.2); tilt = rng.uniform(.45, 1.0); a = rng.uniform(0, np.pi)
        x0, x1, y0, y1 = int(max(0, cx - r - 1)), int(min(n, cx + r + 2)), int(max(0, cy - r - 1)), int(min(half, cy + r + 2))
        if x1 <= x0 or y1 <= y0: continue
        X, Y = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
        u = X * np.cos(a) + Y * np.sin(a); v = (-X * np.sin(a) + Y * np.cos(a)) / tilt
        d = np.hypot(u, v) / r
        m = d < 1
        kind = rng.uniform()
        c = gold * rng.uniform(.75, 1.15) if kind < .9 else (np.array([.62, .62, .6]) if kind < .96 else np.array([.55, .3, .16]))
        lit = .95 + .17 * (u / r) - .2 * (1 - tilt)
        rim = np.clip((d - .78) / .22, 0, 1)
        boss = (d < .45) * .12
        face = np.clip(1 - rim * .45, 0, 1) * lit + boss
        sub = col[y0:y1, x0:x1]; sub[m] = (c[None, None, :] * face[..., None])[m]
        hs = hgt[y0:y1, x0:x1]; hs[m] = (rng.uniform(.4, 1) - .3 * rim + boss)[m]
    # bottom: coin edges in a column, ~3.3 px a coin, milled, a dark seam between
    ly = yy - half
    k = np.clip(np.floor(ly / 3.3).astype(int), 0, 199)
    within = ly / 3.3 - np.floor(ly / 3.3)
    tone = .85 + .3 * np.random.default_rng(seed + 1).uniform(size=200)[k]
    edge = np.clip(1 - np.abs(within - .5) * 2.1, 0, 1) ** .6
    mill = .9 + .1 * np.sin(xx * 2.2)
    bot = gold[None, None, :] * (edge * tone * mill)[..., None] + np.array([.08, .05, .02]) * (1 - edge)[..., None]
    col[half:] = bot[half:]
    hgt[half:] = edge[half:] * .8
    return np.clip(col, 0, 1), hgt


SPINE_PAL = [
    ((.36, .10, .08), 'leather'), ((.42, .25, .14), 'leather'), ((.14, .22, .14), 'leather'), ((.12, .14, .24), 'leather'),
    ((.09, .08, .08), 'leather'), ((.30, .14, .20), 'leather'), ((.52, .36, .20), 'leather'), ((.78, .70, .54), 'vellum'),
    ((.70, .62, .46), 'vellum'), ((.26, .28, .30), 'cloth'), ((.40, .16, .10), 'cloth'), ((.46, .40, .22), 'leather'),
    ((.22, .12, .07), 'leather'), ((.18, .24, .22), 'cloth'), ((.58, .50, .36), 'vellum'), ((.31, .19, .11), 'leather'),
]


def _spines(T, seed):
    n = INNER
    rng = np.random.default_rng(seed)
    col = np.zeros((n, n, 3)); hgt = np.full((n, n), .5)
    cw, rh = n / SPINE_COLS, n / SPINE_ROWS
    grain = T.fnoise(n, n, 2, 2, seed + 1)
    blot = T.fnoise(n, n, 14, 30, seed + 2)
    gilt = np.array([.80, .62, .28])
    for r in range(SPINE_ROWS):
        for c in range(SPINE_COLS):
            x0, x1 = int(round(c * cw)), int(round((c + 1) * cw))
            y0, y1 = int(round(r * rh)), int(round((r + 1) * rh))
            ys = y0 + int(round((y1 - y0) * SPINE_SPLIT))        # spine above, cover below
            base, kind = SPINE_PAL[(c + r * 7) % len(SPINE_PAL)]
            base = np.array(base) * rng.uniform(.85, 1.12)
            w, H = x1 - x0, ys - y0
            ux = (np.arange(w) + .5) / w
            round_ = (.72 + .28 * np.sin(np.pi * ux))[None, :]  # the spine's curve, lit along its crown
            tile = np.ones((H, w, 3)) * base
            g = grain[y0:ys, x0:x1]; b = blot[y0:ys, x0:x1]
            if kind == 'leather':
                tile *= (.82 + .22 * g + .12 * (b - .5))[..., None]
            elif kind == 'vellum':
                tile *= (.9 + .1 * g - .15 * T.smooth(.6, .9, b))[..., None]
            else:
                wv = .5 + .5 * np.sin(np.arange(w)[None, :] * 2.6) * np.sin(np.arange(H)[:, None] * 2.6)
                tile *= (.86 + .14 * wv)[..., None]
            tile *= round_[..., None]
            th = np.full((H, w), .5) + .1 * (g - .5)
            yv = np.arange(H)
            # raised bands (leather) or tie lines (vellum), gilt rules on the fine bindings
            nb = int(rng.integers(3, 6)) if kind != 'cloth' else 0
            fine = kind == 'leather' and rng.uniform() < .7
            pos = list(np.linspace(.16, .84, nb)) if nb else []
            for p in pos:
                py = int(p * H)
                tile[max(0, py - 2):py, :] *= 1.25; tile[py:py + 2, :] *= .55
                th[max(0, py - 2):py + 1, :] += .45
                if kind == 'vellum':
                    tile[py - 1:py + 1, :] = np.array([.25, .18, .12])
                elif fine:
                    for gy in (py - 4, py + 3):
                        if 0 <= gy < H: tile[gy, 1:w - 1] = gilt * rng.uniform(.85, 1.1)
            # a title label in the second panel: a red or black field with gilt strokes
            if kind != 'cloth' and nb >= 3 and rng.uniform() < .8:
                ya, yb = int(pos[0] * H) + 4, int(pos[1] * H) - 4
                if yb - ya > 6:
                    lab = np.array((.42, .08, .06) if rng.uniform() < .5 else (.08, .07, .07))
                    if kind == 'vellum': lab = np.array((.86, .80, .64))
                    tile[ya:yb, 1:w - 1] = lab[None, :] * round_[0, 1:w - 1][:, None]
                    ink = gilt if kind != 'vellum' else np.array((.12, .09, .07))
                    for ty in range(ya + 2, yb - 2, 3):
                        L = int(rng.integers(max(2, w // 3), max(3, w - 3)))
                        x_ = (w - L) // 2
                        tile[ty, x_:x_ + L] = ink
            elif kind == 'cloth':
                for gy in (int(.08 * H), int(.92 * H)):
                    tile[gy, 1:w - 1] = gilt * .9
                for ty in range(int(.16 * H), int(.34 * H), 3):
                    tile[ty, 2:w - 2] = gilt * .85
            # wear: head and tail rubbed lighter
            wear = T.smooth(.1, 0, yv / H) + T.smooth(.9, 1, yv / H)
            tile = tile * (1 - .6 * wear[:, None, None]) + (tile * 1.35 + .05) * (.6 * wear[:, None, None])
            col[y0:ys, x0:x1] = tile; hgt[y0:ys, x0:x1] = th
            # the cover below: plain, the same stuff
            cov = np.ones((y1 - ys, w, 3)) * base * (.8 + .2 * grain[ys:y1, x0:x1] + .1 * (blot[ys:y1, x0:x1] - .5))[..., None]
            col[ys:y1, x0:x1] = cov; hgt[ys:y1, x0:x1] = .5 + .1 * grain[ys:y1, x0:x1]
    return np.clip(col, 0, 1), hgt


def paint(name, h, w, T):
    if name == 'pkgB1': col, hgt = _bands(T, 7101)
    elif name == 'pkgB2': col, hgt = _coins(T, 7202)
    elif name == 'pkgB3': col, hgt = _spines(T, 7303)
    else: return None
    return _pad(col, hgt, h, w)
