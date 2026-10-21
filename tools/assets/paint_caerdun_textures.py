"""Paint Caerdun's Sea Gate sheets (caerdun_atlas.py is the layout).

    python3 tools/assets/paint_caerdun_textures.py              paint every sheet
    python3 tools/assets/paint_caerdun_textures.py --compose    paste the builder's
                                                                LOD renders into the far
                                                                sheet and the stone sheet's
                                                                l1_arc strip, then stack the
                                                                facade and its companions

build_caerdun_modules.py runs both. System python (numpy + PIL). Deterministic:
every random draw comes from a seeded generator, the JPEGs are written at q90 with
no chroma subsampling, the PNGs without optimisation.

Writes the part sheets the facade is stacked from -- stone, far, joinery, glass and
their night sheets -- to tools/assets/build/caerdun/ (gitignored: the runtime loads
none of them), and only what the game binds to client/public/models/seagate/:
sg_facade.jpg + sg_facade_rough.png + sg_facade_glow.png + sg_facade.json, sg_slate.jpg,
sg_glow.jpg + sg_glow_e.png, and the three paving sheets.

THE GRANITE IS DIRECTION C's (CF-4, "I like C's current granite, so don't borrow
that from A"): paint_stone() is the mock-up's r1 painter, unchanged -- palette,
seeds, courses and strip rows -- and the l1_arc strip is a render of the arcade.
Heraldry is Caerdun blue #2c4a6e and bone #e6dfcc with the ledger-and-key, no red
anywhere (CF-8; the module test reads every shipped sheet for red).
"""
import sys, os, math, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import caerdun_atlas as A

ROOT = HERE.parents[1]
OUT = Path(os.environ.get('CAERDUN_OUT', ROOT / 'client/public/models/seagate'))
BUILD = Path(os.environ.get('CAERDUN_BUILD', HERE / 'build/caerdun'))
COMPOSE = '--compose' in sys.argv


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float64)


def blur(a, sx, sy=None):
    """Periodic gaussian blur via FFT (the sheets tile, so the noise must too)."""
    sy = sx if sy is None else sy
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * ((fx * sx) ** 2 + (fy * sy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def noise(h, w, rng, sx, sy=None):
    n = blur(rng.standard_normal((h, w)), sx, sy)
    s = n.std()
    return n / (s if s > 0 else 1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ masonry (C's r1, unchanged)
def masonry(h, w, courses, blen, period, base, seed, joint=5, rock=0.25, tone=0.07,
            drafted=0, mortar=0.6, speck=1.0, hue=0.0035, wear=0.0, rubble=()):
    """Coursed granite blocks, periodic every `period` px across and `h` px down."""
    assert sum(courses) == h, (sum(courses), h)
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3))
    hgt = np.zeros((h, w))
    jm = np.zeros((h, w))
    edge = np.zeros((h, w))
    cols = np.arange(w)
    y0 = 0
    for ci, ch in enumerate(courses):
        bl = (blen[0] * 0.3, blen[0] * 0.75) if ci in rubble else blen
        js, x = [], rng.uniform(0, bl[1])
        while x < period - bl[0] * 0.6:
            js.append(x)
            x += rng.uniform(*bl)
        js = np.array(js)
        full = np.concatenate([js + k * period for k in range(w // period)])
        n = len(full)
        idx = (np.searchsorted(full, cols, side='right') - 1) % n
        left = full[idx]
        right = full[(idx + 1) % n]
        dl = (cols - left) % w
        dr = (right - cols) % w
        tones = rng.standard_normal(n) * (1.6 if ci in rubble else 1.0)
        tint = rng.standard_normal((n, 3)) * hue
        bump = rng.uniform(0.6, 1.4, n)
        jit = rng.integers(-3, 4, n) if ci in rubble else np.zeros(n, int)
        for r in range(ch):
            y = y0 + r
            dt, db = r + 0.5 - jit[idx].clip(-2, 2) * 0, ch - r - 0.5
            e = np.minimum(np.minimum(dl, dr), np.minimum(dt, db))
            edge[y] = e
            jm[y] = (np.minimum(dl, dr) < joint / 2) | (np.minimum(dt, db) < joint / 2)
            c = base[None, :] * (1 + tones[idx][:, None] * tone) + tint[idx]
            img[y] = c
            hgt[y] = np.clip(e / 14.0, 0, 1) ** 0.6 * bump[idx]
        y0 += ch
    rough = noise(h, w, rng, 3.0) * 0.55 + noise(h, w, rng, 9.0) * 0.45
    hgt = hgt * 0.35 + hgt * 0.65 + rough * rock * 0.6
    if drafted:
        hgt = np.where(edge < drafted, np.minimum(hgt, 0.15), hgt + 0.25)
    gy, gx = np.gradient(hgt)
    shade = np.clip(-gx * 0.9 - gy * 1.4, -1.2, 1.2)
    img *= (1 + shade[..., None] * (0.22 + 0.25 * rock))
    if speck:
        s1 = noise(h, w, rng, 0.6)
        img *= np.where(s1 > 1.9, 0.78, 1.0)[..., None]
        img += np.where(s1 < -2.0, 0.05, 0.0)[..., None]
        img *= (1 + noise(h, w, rng, 2.5)[..., None] * 0.02 * speck)
    img *= (1 + noise(h, w, rng, 18.0)[..., None] * 0.035)
    if wear:
        wn = noise(h, w, rng, 1.2)
        rim = (edge > joint / 2) & (edge < joint / 2 + 3) & (wn > 0.2)
        img = np.where(rim[..., None], img * (1 + wear), img)
    img = np.clip(img, 0, 1)
    jm_soft = np.clip(blur(jm, 0.7), 0, 1)
    mort = base * mortar
    img = img * (1 - jm_soft[..., None]) + (mort[None, None, :] * (1 + noise(h, w, rng, 1.0)[..., None] * 0.06)) * jm_soft[..., None]
    return np.clip(img, 0, 1), jm


def streaks(img, rng, n, col, amount, length=(40, 260), width=(2, 7), dark=False):
    """Vertical runs down the face: salt (pale) or damp (dark), periodic."""
    h, w, _ = img.shape
    m = np.zeros((h, w))
    for _ in range(n):
        x = rng.integers(0, w)
        y = rng.integers(0, h)
        L = rng.integers(*length)
        wd = rng.integers(*width)
        a = rng.uniform(0.4, 1.0)
        for k in range(L):
            yy = (y + k) % h
            f = a * (1 - k / L) ** 1.1
            for dx in range(-wd, wd + 1):
                xx = (x + dx + int(3 * math.sin(k / 23.0))) % w
                m[yy, xx] = max(m[yy, xx], f * (1 - abs(dx) / (wd + 1)))
    m = np.clip(blur(m, 1.2, 3.0), 0, 1)
    c = hexc(col)
    return np.clip(img * (1 - m[..., None] * amount) + c[None, None, :] * m[..., None] * amount, 0, 1)


def lichen(img, rng, amount):
    h, w, _ = img.shape
    l1 = noise(h, w, rng, 7.0) + noise(h, w, rng, 2.0) * 0.4
    l2 = noise(h, w, rng, 5.0) + noise(h, w, rng, 1.5) * 0.4
    m1 = smooth(2.0, 2.6, l1) * amount
    m2 = smooth(2.2, 2.8, l2) * amount
    out = img * (1 - m1[..., None] * 0.7) + hexc(A.PAL['lichen1'])[None, None, :] * m1[..., None] * 0.7
    out = out * (1 - m2[..., None] * 0.6) + hexc(A.PAL['lichen2'])[None, None, :] * m2[..., None] * 0.6
    return np.clip(out, 0, 1)


def put_strip(sheet, top, strip):
    h = strip.shape[0]
    sheet[top:top + h] = strip
    g = A.GUTTER
    sheet[top - g:top] = strip[h - g:h]          # wrap-copy gutters: filtering across a cut is seamless
    sheet[top + h:top + h + g] = strip[0:g]


def rect_of(key):
    _, _, x0, y0, x1, y1 = A.REGIONS[key]
    return x0, y0, x1, y1


def put_rect(sheet, key, img):
    x0, y0, x1, y1 = rect_of(key)
    sheet[y0:y1, x0:x1] = img[:y1 - y0, :x1 - x0]
    # an 8 px border of the picture's own edge colour (mipmaps must not pick up neighbours)
    g = A.GUTTER
    H, W = sheet.shape[:2]
    sheet[max(0, y0 - g):y0, x0:x1] = sheet[y0:y0 + 1, x0:x1]
    sheet[y1:min(H, y1 + g), x0:x1] = sheet[y1 - 1:y1, x0:x1]
    sheet[max(0, y0 - g):min(H, y1 + g), max(0, x0 - g):x0] = sheet[max(0, y0 - g):min(H, y1 + g), x0:x0 + 1]
    sheet[max(0, y0 - g):min(H, y1 + g), x1:min(W, x1 + g)] = sheet[max(0, y0 - g):min(H, y1 + g), x1 - 1:x1]


def to8(a):
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_jpg(a, path):
    Image.fromarray(to8(a)).save(path, quality=90, subsampling=0, optimize=False)


def save_png(a, path):
    Image.fromarray(to8(a)).save(path, optimize=False)


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64) / 255


# ------------------------------------------------------------------ the granite atlas (C's r1, unchanged)
def paint_stone():
    S = A.SHEETS['SG_Stone']['size'][0]
    sheet = np.zeros((S, S, 3))
    sheet[:] = hexc(A.PAL['under'])
    R = A.REGIONS
    ash = hexc(A.PAL['ashlar'])
    s, _ = masonry(384, S, [64, 60, 66, 58, 70, 66], (78, 170), 1024, ash * 1.05, 21, joint=4, rock=0.32, tone=0.07, wear=0.06)
    rng = np.random.default_rng(22)
    s = streaks(s, rng, 120, '#6d7278', 0.35, length=(60, 300), width=(3, 9))
    s = streaks(s, rng, 260, A.PAL['salt'], 0.8, length=(30, 240), width=(2, 6))
    s = lichen(s, rng, 0.5)
    put_strip(sheet, R['sea'][2], s)
    a, _ = masonry(384, S, [62, 66, 60, 68, 62, 66], (78, 170), 1024, ash * np.array([1.0, 0.995, 0.975]), 11, joint=4, rock=0.3, tone=0.06, wear=0.05)
    a = streaks(a, np.random.default_rng(12), 90, '#787c80', 0.25, length=(40, 200), width=(3, 8))
    put_strip(sheet, R['ash'][2], a)
    hs, _ = masonry(256, S, [42, 44, 42, 43, 42, 43], (60, 150), 512, hexc(A.PAL['house']), 81, joint=3, rock=0.22, tone=0.05,
                    wear=0.07, rubble=(1, 4), hue=0.002, speck=0.35, mortar=0.72)
    hs = streaks(hs, np.random.default_rng(82), 60, '#7f8080', 0.2, length=(30, 120), width=(2, 5))
    put_strip(sheet, R['house'][2], hs)
    b, _ = masonry(192, S, [96, 96], (130, 250), 1024, hexc(A.PAL['plinth']), 31, joint=5, rock=0.9, tone=0.07, drafted=7)
    b = streaks(b, np.random.default_rng(32), 50, A.PAL['salt'], 0.4, length=(20, 120))
    put_strip(sheet, R['base'][2], b)
    c, _ = masonry(192, S, [64, 72, 56], (110, 260), 1024, hexc(A.PAL['scarp']), 41, joint=5, rock=1.0, tone=0.09, mortar=0.5)
    rng = np.random.default_rng(42)
    damp = smooth(0.5, 1.8, noise(192, S, rng, 14))
    c *= (1 - damp[..., None] * 0.12)
    c = streaks(c, rng, 60, A.PAL['salt'], 0.35, length=(20, 140))
    c = lichen(c, rng, 0.6)
    put_strip(sheet, R['scarp'][2], c)
    t, _ = masonry(128, S, [64, 64], (70, 150), 512, hexc(A.PAL['trim']), 51, joint=3, rock=0.05, tone=0.045, speck=0.6, hue=0.004, wear=0.05)
    put_strip(sheet, R['trim'][2], t)
    w, _ = masonry(96, S, [48, 48], (90, 190), 512, ash * 0.7, 61, joint=4, rock=0.4, tone=0.06)
    rng = np.random.default_rng(62)
    y = np.linspace(0, 1, 96)[:, None]
    wm = np.clip((y - 0.3) / 0.25 + noise(96, S, rng, 5, 12) * 0.3, 0, 1)
    weed = hexc(A.PAL['weed']) * 0.85 * (1 + noise(96, S, rng, 3.5)[..., None] * 0.14 + noise(96, S, rng, 0.8)[..., None] * 0.05)
    w = w * (1 - wm[..., None]) + weed * wm[..., None]
    barn = (noise(96, S, rng, 0.6) > 2.1) & (np.abs(y - 0.3) < 0.15)
    w = np.where(barn[..., None], hexc(A.PAL['salt'])[None, None, :] * 0.9, w)
    put_strip(sheet, R['weed'][2], np.clip(w, 0, 1))
    d, _ = masonry(64, S, [64], (120, 240), 512, hexc(A.PAL['under']), 71, joint=3, rock=0.1, tone=0.04, speck=0.4, mortar=0.75)
    put_strip(sheet, R['dark'][2], d)
    put_strip(sheet, R['l1_arc'][2], paint_l1_arc(s))
    save_png(sheet, BUILD / A.SHEETS['SG_Stone']['build'])
    return sheet


def paint_l1_arc(sea):
    """The LOD1 strip (5.5 m at 32 px/m, a 4 m bay = 128 px): a procedural stand-in;
    the builder renders the real arcade bay over it (--compose)."""
    h, w = 176, 2048
    base = np.array(Image.fromarray((sea * 255).astype(np.uint8)).resize((w // 3, sea.shape[0] // 3), Image.BILINEAR)).astype(float) / 255
    img = np.tile(base, (int(np.ceil(h / base.shape[0])) + 1, 4, 1))[:h, :w]
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx % 128) / 32.0 - 2.0
    v = 13.4 - yy / 32.0
    sp, rise, half = 9.3, 1.95, 1.6
    r = (rise * rise + half * half) / (2 * half)
    inside = (np.abs(u) < half) & (v < sp)
    head = (v >= sp) & (np.abs(u) < half) & (((np.abs(u) - half + r) ** 2 + (v - sp) ** 2) < r * r)
    slot = np.clip((v - sp + 0.6) / (rise + 0.6), 0, 1)
    img = np.where(inside[..., None], img * 0.72, img)
    img = np.where(head[..., None], img * (0.62 - 0.5 * slot)[..., None], img)
    sc = (v > 11.54) & (v < 11.76)
    img = np.where(sc[..., None], hexc(A.PAL['trim'])[None, None, :], img)
    gap = (v > 12.2) & ((np.abs(((xx % 64) / 32.0) - 1.0)) < 0.31)
    img = np.where(gap[..., None], img * 0.45, img)
    return np.clip(img, 0, 1)


# ------------------------------------------------------------------ the far sheet (pictures composed in later)
def paint_far():
    W, H = A.SHEETS['SG_Far']['size']
    sheet = np.zeros((H, W, 3))
    sheet[:] = hexc(A.VIEW_BG)
    for k in A.FAR_RECTS:
        x0, y0, x1, y1 = rect_of(k)
        put_rect(sheet, k, np.ones((y1 - y0, x1 - x0, 3)) * hexc(A.PAL['ashlar']))
    save_png(sheet, BUILD / A.SHEETS['SG_Far']['build'])
    save_png(np.zeros((H, W, 3)), BUILD / 'sg_far_e.png')


# ------------------------------------------------------------------ paving (makePath sheets: 4 m tiles, 512 px)
def setts(n, rng):
    """Granite setts, 0.2 x 0.27 m in running bond, periodic over n px (4 m)."""
    img = np.zeros((n, n, 3))
    jm = np.zeros((n, n))
    rows = 15
    rh = n / rows
    base = hexc(A.PAL['setts'])
    for r in range(rows):
        y0, y1 = int(round(r * rh)), int(round((r + 1) * rh))
        cols = 19
        cw = n / cols
        off = (r % 2) * cw / 2
        for c in range(cols + 1):
            x0 = int(round(c * cw + off)) % n
            wdt = int(round(cw))
            t = rng.normal(0, 0.07)
            tint = np.array([1.0, 0.98, 0.94]) * rng.normal(0, 0.012)
            xs = (np.arange(x0, x0 + wdt)) % n
            img[y0:y1][:, xs] = base * (1 + t) + tint
            jm[y0:y0 + 2][:, xs] = 1
            jm[y0:y1][:, xs[:2]] = 1
    img *= (1 + noise(n, n, rng, 1.2)[..., None] * 0.05)
    domed = np.clip(1 - blur(jm, 2.0) * 1.6, 0.72, 1.0)
    img *= domed[..., None]
    img = img * (1 - jm[..., None] * 0.55)
    img *= (1 + noise(n, n, rng, 30)[..., None] * 0.05)
    return np.clip(img, 0, 1)


def flags(n, rng):
    """Granite flags, rows 0.5-0.9 m, lengths 0.5-1.3 m, periodic over n px."""
    img = np.zeros((n, n, 3))
    jm = np.zeros((n, n))
    base = hexc(A.PAL['flags'])
    ppm = n / 4.0
    hs = []
    while sum(hs) < n - 0.9 * ppm:
        hs.append(int(rng.uniform(0.5, 0.9) * ppm))
    hs.append(n - sum(hs))
    y = 0
    for h in hs:
        ls = []
        while sum(ls) < n - 1.3 * ppm:
            ls.append(int(rng.uniform(0.5, 1.3) * ppm))
        ls.append(n - sum(ls))
        x = int(rng.uniform(0, n))
        for L in ls:
            xs = np.arange(x, x + L) % n
            t = rng.normal(0, 0.06)
            img[y:y + h][:, xs] = base * (1 + t)
            jm[y:y + 2][:, xs] = 1
            jm[y:y + h][:, xs[:2]] = 1
            x += L
        y += h
    img *= (1 + noise(n, n, rng, 2.0)[..., None] * 0.04 + noise(n, n, rng, 0.7)[..., None] * 0.025)
    img *= (1 + noise(n, n, rng, 25)[..., None] * 0.05)
    img = img * (1 - np.clip(blur(jm, 0.8), 0, 1)[..., None] * 0.5)
    return np.clip(img, 0, 1)


def earth(n, rng):
    base = hexc(A.PAL['earth'])
    img = base[None, None, :] * (1 + noise(n, n, rng, 12)[..., None] * 0.07 + noise(n, n, rng, 2.5)[..., None] * 0.05)
    g = noise(n, n, rng, 0.7)
    img = np.where((g > 1.6)[..., None], img * 1.25, img)
    img = np.where((g < -1.8)[..., None], img * 0.75, img)
    tuft = smooth(1.8, 2.6, noise(n, n, rng, 4))
    img = img * (1 - tuft[..., None] * 0.5) + hexc('#5f6a4c')[None, None, :] * tuft[..., None] * 0.5
    return np.clip(img, 0, 1)


def paint_paving():
    n = A.PAVE['px']
    rng = np.random.default_rng(401)
    save_jpg(setts(n, rng), OUT / A.PAVE['setts'])
    save_jpg(flags(n, rng), OUT / A.PAVE['flags'])
    save_jpg(earth(n, rng), OUT / A.PAVE['earth'])


# ------------------------------------------------------------------ joinery
def boards(h, w, rng, base, bw=(18, 27), grain=(0.6, 26), gap=2, straps=(), studs=True):
    img = np.zeros((h, w, 3))
    x, edges = 0, []
    while x < w:
        edges.append(x)
        x += int(rng.integers(*bw))
    edges[-1] = w if w - edges[-1] < bw[0] else edges[-1]
    if edges[-1] != w:
        edges.append(w)
    g = noise(h, w, rng, *grain)
    for a, b in zip(edges, edges[1:]):
        t = rng.normal(0, 0.08)
        img[:, a:b] = base * (1 + t)
        img[:, a:min(a + gap, b)] *= 0.35
    img *= (1 + g[..., None] * 0.12)
    for (y0, y1) in straps:
        img[y0:y1] = hexc(A.PAL['iron']) * (1 + noise(y1 - y0, w, rng, 1.0)[..., None] * 0.1)
        img[y0:y0 + 1] *= 1.5
        if studs:
            for sx in range(10, w, 24):
                cy = (y0 + y1) // 2
                img[cy - 2:cy + 2, sx - 2:sx + 2] = hexc('#4a4e54')
    return np.clip(img, 0, 1)


def device(draw, cx, cy, s, col, back=None):
    """The open ledger crossed by a key (Caerdun's device), drawn symmetric so the
    game's mirroring changes nothing."""
    pw, ph = 0.42 * s, 0.30 * s
    draw.polygon([(cx, cy - ph * 0.42), (cx - pw, cy - ph * 0.62), (cx - pw, cy + ph * 0.5), (cx, cy + ph * 0.7)], fill=col)
    draw.polygon([(cx, cy - ph * 0.42), (cx + pw, cy - ph * 0.62), (cx + pw, cy + ph * 0.5), (cx, cy + ph * 0.7)], fill=col)
    if back is not None:
        draw.line([(cx, cy - ph * 0.42), (cx, cy + ph * 0.7)], fill=back, width=max(2, int(s * 0.02)))
        for k in range(1, 4):
            yy = cy - ph * 0.42 + k * ph * 0.25
            draw.line([(cx - pw * 0.85, yy - ph * 0.12), (cx - pw * 0.15, yy)], fill=back, width=max(1, int(s * 0.012)))
            draw.line([(cx + pw * 0.15, yy), (cx + pw * 0.85, yy - ph * 0.12)], fill=back, width=max(1, int(s * 0.012)))
    kw = max(3, int(s * 0.05))
    draw.line([(cx, cy - 0.62 * s), (cx, cy + 0.55 * s)], fill=col, width=kw)
    r = 0.14 * s
    draw.ellipse([cx - r, cy - 0.62 * s - 2 * r, cx + r, cy - 0.62 * s], outline=col, width=kw)
    draw.rectangle([cx - 0.12 * s, cy + 0.40 * s, cx + 0.12 * s, cy + 0.46 * s], fill=col)
    draw.rectangle([cx - 0.12 * s, cy + 0.49 * s, cx + 0.12 * s, cy + 0.55 * s], fill=col)


def paint_joinery():
    S = A.SHEETS['SG_Joinery']['size'][0]
    sheet = np.zeros((S, S, 3))
    sheet[:] = hexc(A.PAL['iron'])
    emi = np.zeros((S, S, 3))
    R = A.REGIONS
    rng = np.random.default_rng(101)
    oak = hexc(A.PAL['oak'])
    put_strip(sheet, R['oak'][2], boards(R['oak'][3], S, rng, oak, straps=((28, 38), (148, 158))))
    put_strip(sheet, R['plank'][2], boards(R['plank'][3], S, rng, oak * 1.15, bw=(22, 34)))
    bm = oak * (1 + noise(R['beam'][3], S, rng, 30, 0.8)[..., None] * 0.14)
    for yy in range(0, R['beam'][3], 24):
        bm[yy:yy + 2] *= 0.6
    put_strip(sheet, R['beam'][2], np.clip(bm, 0, 1))
    ir = hexc(A.PAL['iron']) * (1 + noise(R['iron'][3], S, rng, 1.5)[..., None] * 0.15)
    put_strip(sheet, R['iron'][2], np.clip(ir, 0, 1))
    ld = hexc(A.PAL['lead']) * (1 + noise(R['lead'][3], S, rng, 6)[..., None] * 0.08)
    put_strip(sheet, R['lead'][2], np.clip(ld, 0, 1))
    # pentice slate, awning cloth, boat planking
    x0, y0, x1, y1 = rect_of('slate_j')
    sl = np.zeros((y1 - y0, x1 - x0, 3))
    for r in range(0, y1 - y0, 12):
        off = (r // 12 % 2) * 8
        for c in range(-16, x1 - x0, 16):
            t = rng.normal(0, 0.09)
            sl[r:r + 12, max(0, c + off):max(0, c + off + 15)] = hexc(A.PAL['slate']) * (1 + t)
        sl[r + 10:r + 12] *= 0.45
    put_rect(sheet, 'slate_j', np.clip(sl, 0, 1))
    x0, y0, x1, y1 = rect_of('cloth')
    cl = np.zeros((y1 - y0, x1 - x0, 3))
    for c in range(0, x1 - x0):
        cl[:, c] = hexc(A.PAL['blue']) if (c // 14) % 2 == 0 else hexc(A.PAL['bone']) * 0.92
    cl *= (1 + noise(y1 - y0, x1 - x0, rng, 0.6)[..., None] * 0.04)
    cl[-10:] *= 0.8
    put_rect(sheet, 'cloth', np.clip(cl, 0, 1))
    x0, y0, x1, y1 = rect_of('hull')
    hl = np.zeros((y1 - y0, x1 - x0, 3))
    for r in range(y1 - y0):
        k = r // 23
        hl[r] = hexc('#2b2622') * (1 + 0.08 * (k % 2))
        if r % 23 > 19:
            hl[r] *= 0.55
    hl[:24] = hexc(A.PAL['bone']) * 0.8
    hl *= (1 + noise(y1 - y0, x1 - x0, rng, 12, 0.6)[..., None] * 0.08)
    put_rect(sheet, 'hull', np.clip(hl, 0, 1))
    # the lamplit casement: an oak frame, leaded panes warm by night (j_lit)
    x0, y0, x1, y1 = rect_of('j_lit')
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    frame = (xx < 6) | (xx >= w - 6) | (yy < 6) | (yy >= h - 6) | (np.abs(xx - w / 2) < 3) | (np.abs(yy - h * 0.45) < 3)
    lead = ((xx + yy) % 14 < 1) | ((xx - yy) % 14 < 1)
    pane = hexc(A.PAL['glass']) * (0.9 + 0.3 * (1 - yy / h))[..., None]
    jl = np.where(frame[..., None], oak * 0.9, np.where(lead[..., None], hexc(A.PAL['iron']), pane))
    put_rect(sheet, 'j_lit', np.clip(jl, 0, 1))
    glow = 0.55 + 0.45 * np.exp(-(((xx / w - 0.5) / 0.45) ** 2 + ((yy / h - 0.6) / 0.6) ** 2))
    je = np.where(frame[..., None] | lead[..., None], 0.0, 1.0) * hexc(A.PAL['pane'])[None, None, :] * 0.85 * glow[..., None]
    put_rect(emi, 'j_lit', je)
    # the Wage Vaults' ledgers: shelf boards and leather spines (blue, bone, brown -- no red, CF-8)
    x0, y0, x1, y1 = rect_of('shelves')
    h, w = y1 - y0, x1 - x0
    sh = np.zeros((h, w, 3))
    sh[:] = oak * 0.55
    spines = [hexc(A.PAL['blue']), hexc(A.PAL['bone']) * 0.8, hexc('#504a3e'), hexc('#3d4a52'), hexc('#6b6656')]   # no leather red (CF-8)
    for (ya, yb) in ((6, 38), (46, 78), (86, 118)):
        x = 4
        while x < w - 4:
            bw_ = int(rng.integers(4, 9))
            col = spines[int(rng.integers(0, len(spines)))] * (0.85 + 0.25 * rng.random())
            top = ya + int(rng.integers(0, 6))
            sh[top:yb, x:x + bw_ - 1] = col
            sh[top + 4:top + 6, x:x + bw_ - 1] *= 1.3
            x += bw_
        sh[yb:yb + 6] = oak * 1.05
    # softened a pixel: hard bone-on-blue spine edges ring red in the JPEG (CF-8)
    sh = (sh + np.roll(sh, 1, 0) + np.roll(sh, -1, 0) + np.roll(sh, 1, 1) + np.roll(sh, -1, 1)) / 5
    put_rect(sheet, 'shelves', np.clip(sh, 0, 1))
    img = Image.fromarray(to8(sheet))
    d = ImageDraw.Draw(img)
    blue, bone = tuple(int(255 * v) for v in hexc(A.PAL['blue'])), tuple(int(255 * v) for v in hexc(A.PAL['bone']))
    for key, field, ink in (('banner', blue, bone), ('bannerw', bone, blue)):
        x0, y0, x1, y1 = rect_of(key)
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=field)
        d.rectangle([x0 + 8, y0 + 8, x1 - 9, y1 - 9], outline=ink, width=7)
        device(d, (x0 + x1) / 2, (y0 + y1) / 2 - 6, (x1 - x0) * 0.62, ink, field)
    x0, y0, x1, y1 = rect_of('plaque')
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(182, 176, 160))
    d.rectangle([x0 + 12, y0 + 12, x1 - 13, y1 - 13], fill=blue)
    d.rectangle([x0 + 18, y0 + 18, x1 - 19, y1 - 19], outline=bone, width=6)
    device(d, (x0 + x1) / 2, (y0 + y1) / 2 + 8, (x1 - x0) * 0.66, bone, blue)
    for key, shape in (('sign_key', 'key'), ('sign_fish', 'fish'), ('sign_cup', 'cup'), ('sign_boot', 'ship'), ('sign_blank', None)):
        x0, y0, x1, y1 = rect_of(key)
        if shape is None:
            # sg_sign: a blank Caerdun-blue board with a bone border (CF-8)
            d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=blue)
            d.rectangle([x0 + 4, y0 + 4, x1 - 5, y1 - 5], outline=bone, width=3)
            continue
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(64, 50, 38))
        d.rectangle([x0 + 3, y0 + 3, x1 - 4, y1 - 4], outline=(150, 128, 92), width=2)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        ink = (214, 200, 160)
        if shape == 'key':
            d.ellipse([cx - 9, cy - 22, cx + 9, cy - 4], outline=ink, width=4)
            d.line([(cx, cy - 4), (cx, cy + 22)], fill=ink, width=4)
            d.rectangle([cx - 8, cy + 12, cx + 8, cy + 16], fill=ink)
        elif shape == 'fish':
            d.ellipse([cx - 20, cy - 9, cx + 20, cy + 9], fill=ink)
            d.polygon([(cx - 18, cy), (cx - 26, cy - 10), (cx - 26, cy + 10)], fill=ink)
            d.polygon([(cx + 18, cy), (cx + 26, cy - 10), (cx + 26, cy + 10)], fill=ink)
        elif shape == 'cup':
            d.polygon([(cx - 16, cy - 16), (cx + 16, cy - 16), (cx + 8, cy + 6), (cx - 8, cy + 6)], fill=ink)
            d.rectangle([cx - 3, cy + 6, cx + 3, cy + 16], fill=ink)
            d.rectangle([cx - 12, cy + 16, cx + 12, cy + 20], fill=ink)
        else:
            d.polygon([(cx - 22, cy + 4), (cx + 22, cy + 4), (cx + 14, cy + 16), (cx - 14, cy + 16)], fill=ink)
            d.line([(cx, cy + 4), (cx, cy - 22)], fill=ink, width=3)
            d.polygon([(cx - 14, cy - 18), (cx + 14, cy - 18), (cx + 12, cy), (cx - 12, cy)], fill=ink)
    # the clock's face: Caerdun blue, bone hour marks and chapter ring (the brass is geometry)
    x0, y0, x1, y1 = rect_of('dial')
    cx, cy, rr = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=blue)
    d.ellipse([cx - rr * 0.82, cy - rr * 0.82, cx + rr * 0.82, cy + rr * 0.82], outline=bone, width=3)
    d.ellipse([cx - rr * 0.55, cy - rr * 0.55, cx + rr * 0.55, cy + rr * 0.55], outline=bone, width=2)
    for k in range(12):
        a = 2 * math.pi * k / 12
        d.line([(cx + math.cos(a) * rr * 0.6, cy + math.sin(a) * rr * 0.6), (cx + math.cos(a) * rr * 0.78, cy + math.sin(a) * rr * 0.78)], fill=bone, width=4)
    a = np.asarray(img).astype(np.float64) / 255
    for key in ('banner', 'bannerw'):
        x0, y0, x1, y1 = rect_of(key)
        h, w = y1 - y0, x1 - x0
        weave = noise(h, w, rng, 0.5) * 0.04
        fold = np.sin(np.linspace(0, 3 * math.pi, w))[None, :] * 0.07
        a[y0:y1, x0:x1] *= (1 + weave + fold)[..., None]
    paint_yard(a)
    paint_devices(a)
    paint_swatches(a)
    save_png(a, BUILD / A.SHEETS['SG_Joinery']['build'])
    save_png(emi, BUILD / 'sg_joinery_e.png')
    return a


def paint_yard(a):
    """The close-out pass's two yard pictures, painted last with their own seed so
    every earlier pixel of the sheet is unchanged: a raised bed's top (dark soil,
    cabbage rosettes and leek rows) and a log stack's end grain. No red (CF-8): the
    soil and the bark stay grey-brown, the cut wood straw."""
    rng = np.random.default_rng(907)
    x0, y0, x1, y1 = rect_of('garden')
    h, w = y1 - y0, x1 - x0
    # (a cool grey-brown: a warmer soil rang red in the JPEG at the cabbages' edges, CF-8)
    soil = hexc('#423f3a') * (1 + noise(h, w, rng, 3)[..., None] * 0.06 + noise(h, w, rng, 0.8)[..., None] * 0.04)
    img = Image.fromarray(to8(soil))
    d = ImageDraw.Draw(img)
    greens = [(84, 112, 62), (104, 136, 72), (66, 92, 52), (120, 146, 84)]
    for row in range(4):
        cx0 = 16 + row * 32
        if row % 2 == 0:
            for k in range(5):
                cy = 12 + k * 26 + int(rng.integers(-3, 4))
                cx = cx0 + int(rng.integers(-3, 4))
                r = int(rng.integers(8, 12))
                g0 = greens[int(rng.integers(0, len(greens)))]
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(int(c * 0.85) for c in g0))
                for j in range(5):
                    ang = 2 * math.pi * j / 5 + rng.random()
                    lx, ly = cx + math.cos(ang) * r * 0.55, cy + math.sin(ang) * r * 0.55
                    d.ellipse([lx - r * 0.5, ly - r * 0.5, lx + r * 0.5, ly + r * 0.5], fill=g0)
                d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(150, 168, 112))
        else:
            for k in range(14):
                cy = 4 + k * 9 + int(rng.integers(-2, 3))
                for dx in (-5, 0, 5):
                    d.line([(cx0 + dx, cy), (cx0 + dx + int(rng.integers(-2, 3)), cy + 7)], fill=(122, 150, 88), width=2)
    gd = np.asarray(img).astype(np.float64) / 255
    put_rect(a, 'garden', np.clip(gd, 0, 1))
    x0, y0, x1, y1 = rect_of('logs')
    h, w = y1 - y0, x1 - x0
    lg = np.zeros((h, w, 3))
    lg[:] = hexc('#26231f')
    yy, xx = np.mgrid[0:h, 0:w]
    r0 = 9.0
    for row in range(8):
        cy = 8 + row * 16
        for col in range(9):
            cx = 6 + col * 15 + (8 if row % 2 else 0) + rng.normal(0, 1.2)
            r = r0 * (0.8 + 0.3 * rng.random())
            dd = np.hypot(xx - cx, yy - cy)
            wood = hexc('#968a76') * (0.82 + 0.18 * rng.random())
            ring = 0.92 + 0.08 * np.cos(dd * 2.2)
            inside = dd < r
            lg = np.where(inside[..., None], wood[None, None, :] * ring[..., None], lg)
            bark = (dd >= r - 1.6) & (dd < r)
            lg = np.where(bark[..., None], hexc('#55504a')[None, None, :], lg)
    lg *= (1 + noise(h, w, rng, 1.0)[..., None] * 0.05)
    put_rect(a, 'logs', np.clip(lg, 0, 1))


def paint_devices(a):
    """Fix round 2's two pictures, painted last with their own seed so every earlier
    pixel of the sheet is unchanged: the job halls' heater boards (the look review:
    the two halls are one module, and nothing told the shield line from the duelling
    code). Caerdun blue and bone only (CF-8). The board's outline is the picture's
    bounding box cut at its lower corners (caerdun_mod_dress.device_board): a bone
    border runs inside that outline."""
    rng = np.random.default_rng(1207)
    blue, bone = tuple(int(c * 255) for c in hexc(A.PAL['blue'])), tuple(int(c * 255) for c in hexc(A.PAL['bone']))
    for name in ('dev_shield', 'dev_blades'):
        x0, y0, x1, y1 = rect_of(name)
        w, h = x1 - x0, y1 - y0
        img = Image.new('RGB', (w, h), blue)
        d = ImageDraw.Draw(img)
        # the board's outline in the picture (u across 1.6 m, v up 2.0 m; image y down)
        outline = [(-0.8, 2.0), (0.8, 2.0), (0.8, 0.85), (0.55, 0.38), (0.0, 0.0), (-0.55, 0.38), (-0.8, 0.85)]
        px = lambda u, v: ((u + 0.8) / 1.6 * (w - 1), (1 - v / 2.0) * (h - 1))
        d.line([px(u, v) for u, v in outline + outline[:1]], fill=bone, width=6)
        if name == 'dev_shield':
            sh = [(-0.42, 1.62), (0.42, 1.62), (0.42, 1.0), (0.28, 0.66), (0.0, 0.44), (-0.28, 0.66), (-0.42, 1.0)]
            d.polygon([px(u, v) for u, v in sh], fill=bone)
            d.rectangle([px(-0.07, 1.5), px(0.07, 0.6)], fill=blue)
            d.rectangle([px(-0.3, 1.24), px(0.3, 1.1)], fill=blue)
        else:
            for s in (-1, 1):
                # a long gently curved blade from lower corner to upper corner, its guard and grip
                pts = [px(s * -0.5 + s * t * 1.0, 0.62 + t * 1.12 + 0.05 * math.sin(t * math.pi)) for t in np.linspace(0, 1, 9)]
                d.line(pts, fill=bone, width=5)
                gx, gy = px(s * -0.32, 0.86)
                d.ellipse([gx - 5, gy - 5, gx + 5, gy + 5], fill=bone)
                d.line([px(s * -0.5, 0.62), px(s * -0.6, 0.5)], fill=bone, width=6)
        arr = np.asarray(img).astype(np.float64) / 255
        arr *= (1 + noise(h, w, rng, 1.2)[..., None] * 0.04)
        put_rect(a, name, np.clip(arr, 0, 1))


def paint_swatches(a):
    """The auction house's two flat swatches (2026-10-11), painted last and with no
    random draw, so every earlier pixel of the sheet is unchanged: bone and Caerdun
    blue (CF-8) for the shared emblem's relief (auction_emblem.py), whose faces each
    take one point in the middle of their swatch. Flat on purpose: a weave or a grain
    under a point UV is one arbitrary texel, and the AO bake gives the relief its shape."""
    for name, col in (('sw_bone', A.PAL['bone']), ('sw_blue', A.PAL['blue'])):
        x0, y0, x1, y1 = rect_of(name)
        put_rect(a, name, np.ones((y1 - y0, x1 - x0, 3)) * hexc(col))


# ------------------------------------------------------------------ slate
def paint_slate():
    S = A.SHEETS['SG_Slate']['size'][0]
    rng = np.random.default_rng(201)
    base = hexc(A.PAL['slate'])
    img = np.zeros((S, S, 3))
    ch = 32
    for c in range(S // ch):
        y0 = c * ch
        x, edges = rng.uniform(0, 50), []
        while x < S:
            edges.append(x)
            x += rng.uniform(34, 58)
        edges = np.array(edges)
        n = len(edges)
        cols = np.arange(S)
        idx = (np.searchsorted(edges, cols, side='right') - 1) % n
        dl = (cols - edges[idx]) % S
        tone = rng.normal(0, 0.09, n)
        warm = rng.normal(0, 0.02, n)
        for r in range(ch):
            f = r / ch
            col = base * (1 + tone[idx][:, None]) + np.stack([warm[idx], warm[idx] * 0.7, warm[idx] * 0.2], 1)
            col *= (0.82 + 0.3 * f)
            if r >= ch - 3:
                col *= 0.45
            img[y0 + r] = col
            img[y0 + r, dl < 2] *= 0.5
    img *= (1 + noise(S, S, rng, 1.0)[..., None] * 0.05 + noise(S, S, rng, 40)[..., None] * 0.05)
    lich = smooth(2.3, 2.9, noise(S, S, rng, 5) + noise(S, S, rng, 1.5) * 0.3)
    img = img * (1 - lich[..., None] * 0.5) + hexc('#8a8f7a')[None, None, :] * lich[..., None] * 0.5
    save_jpg(img, OUT / A.SHEETS['SG_Slate']['file'])
    save_png(img, BUILD / 'sg_slate.png')


# ------------------------------------------------------------------ glass and glow
def quarries(h, w, rng, lvl, glass, pane):
    yy, xx = np.mgrid[0:h, 0:w]
    u, v = xx / 22.0, yy / 30.0
    d1 = np.abs(((u + v) % 1) - 0.5)
    d2 = np.abs(((u - v) % 1) - 0.5)
    lead = (np.minimum(d1, d2) > 0.45)
    sky = 0.25 + 0.35 * (1 - yy / h)
    a = glass[None, None, :] * (0.8 + sky[..., None]) * (1 + noise(h, w, rng, 4)[..., None] * 0.1)
    a[lead] = hexc(A.PAL['iron'])
    glow = 0.55 + 0.45 * np.exp(-(((xx / w - 0.5) / 0.45) ** 2 + ((yy / h - 0.65) / 0.6) ** 2))
    e = pane[None, None, :] * lvl * glow[..., None] * (0.85 + 0.15 * noise(h, w, rng, 10)[..., None])
    e[lead] *= 0.08
    return a, e


def room_picture(h, w, rng, warm, goods, depth=0.32):
    """A painted interior seen through a door or a shop arch: back wall, side walls
    darkening outward, a floor, goods, a lamp."""
    yy, xx = np.mgrid[0:h, 0:w]
    s, t = xx / (w - 1), yy / (h - 1)
    back = (np.abs(s - 0.5) < depth) & (t < 0.78)
    room = np.where(back, 0.85, 0.45 + 0.35 * (1 - np.abs(s - 0.5) * 2))
    room = np.where(t > 0.78, 0.35 + 0.2 * (1 - t), room)
    if goods == 'shop':
        for sy in (0.3, 0.52):
            band = (np.abs(t - sy) < 0.012) & back
            room = np.where(band, 0.3, room)
            for k in range(9):
                bx = rng.uniform(0.2, 0.78)
                bw, bh = rng.uniform(0.025, 0.06), rng.uniform(0.05, 0.1)
                m = (np.abs(s - bx) < bw) & (t < sy) & (t > sy - bh)
                room = np.where(m, rng.uniform(0.45, 0.75), room)
        cnt = (t > 0.66) & (t < 0.8) & (np.abs(s - 0.5) < 0.42)
        room = np.where(cnt, 0.4, room)
    elif goods == 'store':
        for k in range(7):
            bx, by = rng.uniform(0.15, 0.85), rng.uniform(0.55, 0.78)
            m = ((s - bx) / 0.07) ** 2 + ((t - by) / 0.12) ** 2 < 1
            room = np.where(m, 0.4, room)
    elif goods == 'hall':
        # a long hall: piers receding either side, a far lit end. (2026-10-08, the
        # lead's review: hard dark piers on a bright field read as a glowing grille
        # in the vestibule's inner arch: the piers are soft shadows now, the far end
        # a warm pool, and the whole falls off toward the arch's edges and floor)
        for k in range(4):
            f = 0.16 + 0.09 * k
            for sx in (0.5 - f, 0.5 + f):
                m = np.exp(-((s - sx) / (0.03 * (1 - 0.15 * k))) ** 2) * ((t > 0.12 + 0.05 * k) & (t < 0.8 - 0.02 * k))
                room = room * (1 - 0.35 * m)
        far = np.exp(-(((s - 0.5) / 0.14) ** 2 + ((t - 0.45) / 0.22) ** 2))
        room = np.clip(room * (0.55 + 0.45 * np.exp(-(((s - 0.5) / 0.38) ** 2 + ((t - 0.45) / 0.6) ** 2))) + 0.35 * far, 0, 1)
    lamp = np.exp(-(((s - 0.5) / 0.16) ** 2 + ((t - 0.18) / 0.12) ** 2))
    fall = 0.45 + 0.55 * np.exp(-(((s - 0.5) / 0.5) ** 2 + ((t - 0.3) / 0.7) ** 2))
    lit = np.clip(room * fall + lamp * 0.35, 0, 1)
    alb = hexc('#3a3026')[None, None, :] * (0.5 + 0.6 * room[..., None])
    emi = hexc(warm)[None, None, :] * (0.75 * lit)[..., None]
    return alb, emi


def paint_glass():
    S = A.SHEETS['SG_Glass']['size'][0]
    rng = np.random.default_rng(301)
    alb = np.zeros((S, S, 3))
    emi = np.zeros((S, S, 3))
    glass, pane = hexc(A.PAL['glass']), hexc(A.PAL['pane'])
    for key, lvl in (('g_unlit', 0.0), ('g_lit', 0.9), ('g_half', 0.5)):
        x0, y0, x1, y1 = rect_of(key)
        a, e = quarries(y1 - y0, x1 - x0, rng, lvl, glass, pane)
        put_rect(alb, key, a)
        put_rect(emi, key, e)
    # a lit shop's jambs and soffit: dressed stone by day, washed with lamplight at night
    x0, y0, x1, y1 = rect_of('g_spill')
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    put_rect(alb, 'g_spill', hexc(A.PAL['trim'])[None, None, :] * 0.8 * (1 + noise(h, w, rng, 3)[..., None] * 0.05))
    # LAMPLIGHT THAT FALLS OFF (2026-10-08, the lead's review of CF-16: a full-bright
    # emissive jamb read as a solid amber slab). The faces that take this rect map u to
    # the depth into the opening, 0 at the street, 1 at the lit room behind
    # (caerdun_geom hole(jamb_depth_uv=True); the vestibule's ceiling by hand): warm
    # near the room, near dark at the street end, a little darker at the floor and the
    # head than at shoulder height, and a breath of grain so it is not one flat tone
    s, t = xx / (w - 1), yy / (h - 1)
    along = 0.03 + 0.62 * s ** 2.2
    height = 0.7 + 0.3 * np.exp(-((t - 0.5) / 0.45) ** 2)
    grain = 1 + noise(h, w, np.random.default_rng(302), 4) * 0.06   # (its own seed: the shared rng paints the rooms after it)
    put_rect(emi, 'g_spill', hexc('#e9b876')[None, None, :] * np.clip(along * height * grain, 0, 1)[..., None])
    for key, warm, goods in (('g_shop', '#ffd9a6', 'shop'), ('g_store', '#e8bf86', 'store'), ('g_room', '#f0c890', 'room'),
                             ('g_hall', '#ffd8a0', 'hall')):
        x0, y0, x1, y1 = rect_of(key)
        a, e = room_picture(y1 - y0, x1 - x0, rng, warm, goods)
        put_rect(alb, key, a)
        put_rect(emi, key, e)
    # the lighthouse lantern's glazing: bright warm white at night, a pale lens behind by day
    x0, y0, x1, y1 = rect_of('g_lamp')
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    lens = np.exp(-(((xx / w - 0.5) / 0.35) ** 2 + ((yy / h - 0.55) / 0.4) ** 2))
    put_rect(alb, 'g_lamp', hexc('#8f9a96')[None, None, :] * (0.7 + 0.4 * lens)[..., None])
    put_rect(emi, 'g_lamp', hexc('#fff1c8')[None, None, :] * (0.7 + 0.3 * lens)[..., None])
    save_png(alb, BUILD / A.SHEETS['SG_Glass']['build'])
    save_png(emi, BUILD / 'sg_glass_e.png')


def paint_glow():
    S = A.SHEETS['SG_Glow']['size'][0]
    alb = np.zeros((S, S, 3))
    emi = np.zeros((S, S, 3))
    for key, core, day in (('e_lantern', '#ffd79a', '#6b5d43'), ('e_fire', '#ffd27a', '#3a3530'), ('e_lamp', '#f2e3bd', '#9ea4a0'),
                           ('e_beam', '#fff2d2', '#000000'), ('e_wash', '#ffd8a4', '#000000')):
        x0, y0, x1, y1 = rect_of(key)
        h, w = y1 - y0, x1 - x0
        yy, xx = np.mgrid[0:h, 0:w]
        s, t = xx / (w - 1), 1 - yy / (h - 1)
        if key == 'e_beam':
            across = np.exp(-((t - 0.5) / 0.4) ** 2)
            along = (1 - s) ** 0.9 * (0.5 + 0.5 * np.exp(-s * 2.5))
            e = hexc(core)[None, None, :] * (across * along * 1.0)[..., None]
        elif key == 'e_wash':
            r = np.sqrt(((s - 0.5) / 0.75) ** 2 + ((t - 0.5) / 0.85) ** 2)
            edge = np.clip(np.minimum(s, 1 - s) / 0.12, 0, 1)
            e = hexc(core)[None, None, :] * (np.clip(1 - r, 0, 1) ** 0.9 * 0.85 * (0.55 + 0.45 * edge))[..., None]
        elif key == 'e_lamp':
            r = np.sqrt((s - 0.5) ** 2 + (t - 0.45) ** 2) / 0.5
            e = hexc(core)[None, None, :] * (0.58 - 0.2 * np.clip(r, 0, 1) ** 2)[..., None]
        else:
            r = np.sqrt((s - 0.5) ** 2 + (t - 0.5) ** 2) / 0.5
            e = hexc(core)[None, None, :] * (0.95 - 0.4 * np.clip(r, 0, 1) ** 2)[..., None]
        put_rect(emi, key, e)
        put_rect(alb, key, np.ones((h, w, 3)) * hexc(day))
    save_jpg(alb, OUT / A.SHEETS['SG_Glow']['file'])
    save_png(emi, OUT / A.SHEETS['SG_Glow']['emissive'])
    save_png(alb, BUILD / 'sg_glow.png')
    save_png(emi, BUILD / 'sg_glow_e.png')


# ------------------------------------------------------------------ compose the LOD renders, stack the facade
def compose():
    """Paste the builder's orthographic renders (BUILD/_renders, day and night) into
    the far sheet's pictures and the stone sheet's l1_arc strip, then stack the
    facade sheet and its companions."""
    rd = BUILD / '_renders'
    man = json.loads((rd / 'renders.json').read_text())
    # re-save the renders bare: Cycles writes its own timings into each PNG's text
    # chunks, so the intermediates differ run to run though their pixels never do
    for f in sorted(rd.glob('*.png')):
        im = Image.open(f)
        im.load()
        im.save(f, optimize=False)
    stone = load(BUILD / A.SHEETS['SG_Stone']['build']).copy()
    far = load(BUILD / A.SHEETS['SG_Far']['build']).copy()
    far_e = load(BUILD / 'sg_far_e.png').copy()
    bg = hexc(A.VIEW_BG)
    for key, info in sorted(man.items()):
        im = np.asarray(Image.open(rd / info['file']).convert('RGBA')).astype(np.float64) / 255
        rgb = im[..., :3] * im[..., 3:] + bg * (1 - im[..., 3:])
        if key == 'l1_arc':
            top, h = A.REGIONS['l1_arc'][2], A.REGIONS['l1_arc'][3]
            tile = rgb
            assert tile.shape[0] == h, (tile.shape, h)
            strip = np.tile(tile, (1, A.SHEETS['SG_Stone']['size'][0] // tile.shape[1], 1))
            put_strip(stone, top, strip)
            continue
        put_rect(far, key, rgb)
        if info.get('night'):
            ne = np.asarray(Image.open(rd / info['night']).convert('RGB')).astype(np.float64) / 255
            put_rect(far_e, key, ne)
    save_png(stone, BUILD / A.SHEETS['SG_Stone']['build'])
    save_png(far, BUILD / A.SHEETS['SG_Far']['build'])
    save_png(far_e, BUILD / 'sg_far_e.png')
    facade()
    print('composed', len(man), 'renders')


def half(a):
    h, w = a.shape[:2]
    return a.reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))


def facade():
    """The facade sheet (contract 3.2): stone, far, joinery and glass stacked at their
    own pixels; the joinery's strip rows again beside it; the roughness (G) and the
    night emissive at half resolution; sg_facade.json for the runtime and the test."""
    F = A.FACADE
    W, H = F['size']
    alb = np.zeros((H, W, 3))
    alb[:] = hexc(A.VIEW_BG)
    emi = np.zeros((H, W, 3))
    parts = {
        'stone': (load(BUILD / A.SHEETS['SG_Stone']['build']), None),
        'far': (load(BUILD / A.SHEETS['SG_Far']['build']), load(BUILD / 'sg_far_e.png')),
        'joinery': (load(BUILD / A.SHEETS['SG_Joinery']['build']), load(BUILD / 'sg_joinery_e.png')),
        'glass': (load(BUILD / A.SHEETS['SG_Glass']['build']), load(BUILD / 'sg_glass_e.png')),
    }
    rough = np.zeros((H, W, 3))
    rough[..., 1] = 0.9
    for key, (a, e) in parts.items():
        x, y = F['place'][key]
        h, w = a.shape[:2]
        alb[y:y + h, x:x + w] = a
        if e is not None:
            emi[y:y + h, x:x + w] = e
        rough[y:y + h, x:x + w, 1] = F['roughness'][key]
    sx, sy, sw, sh = F['stripCopy']['src']
    dx, dy = F['stripCopy']['dst']
    jx, jy = F['place']['joinery']
    alb[dy:dy + sh, dx:dx + sw] = alb[jy + sy:jy + sy + sh, jx + sx:jx + sx + sw]
    emi[dy:dy + sh, dx:dx + sw] = emi[jy + sy:jy + sy + sh, jx + sx:jx + sx + sw]
    rough[dy:dy + sh, dx:dx + sw, 1] = F['roughness']['joinery']
    save_jpg(alb, OUT / F['file'])
    save_png(half(rough), OUT / F['rough'])
    save_png(half(emi), OUT / F['glow']['e'])
    (OUT / 'sg_facade.json').write_text(json.dumps({
        'about': "Caerdun's Sea Gate facade sheet: stone, far, joinery and glass stacked into one -- written by tools/assets/paint_caerdun_textures.py "
                 '(caerdun_atlas.FACADE); do not edit by hand.',
        'name': F['name'], 'file': F['file'], 'size': [W, H], 'rough': F['rough'], 'roughSize': [W // F['half'], H // F['half']],
        'glow': F['glow'], 'glowSize': [W // F['half'], H // F['half']],
        'uv': {k: A.facade_uv(k) for k in ('stone', 'far', 'joinery', 'glass')},
        'uvOrder': "[su, ou, sv, ov]: u' = u su + ou, v' = v sv + ov in glTF UVs (v down), as CL_FACADE",
        'parts': F['parts'], 'roughness': F['roughness'], 'stripCopy': F['stripCopy'],
    }, indent=1) + '\n')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    if COMPOSE:
        compose()
        sys.exit(0)
    paint_stone()
    paint_far()
    paint_joinery()
    paint_slate()
    paint_glass()
    paint_glow()
    paint_paving()
    print('painted sheets into', BUILD, 'and', OUT)
