# Dungeon kit v2 surface sheets: albedo + OpenGL normal per sheet, generated,
# seamless, original (no photo, no kit atlas). Written into
# client/public/tex/dungeon/<sheet>_diff.jpg and <sheet>_nor_gl.jpg.
#
#   python3 tools/assets/gen_dungeon_textures.py            # all sheets
#   python3 tools/assets/gen_dungeon_textures.py ashlar     # one sheet
#
# Every sheet tiles with a WHOLE-NUMBER period in metres (PERIOD below), and
# the kit's geometry writes UVs in metres, so a material's texture scale is
# 1/period and courses line up from wall to wall (dungeon-kit/themes.ts reads
# the same table). The albedo is kept near neutral and fairly light: a theme
# tints it by diffuse colour (multiply), so one ashlar sheet is the tomb's
# limestone, the watchtower's granite and the Keep's royal stone. What the
# sheet itself must carry is variation the tint cannot: course and joint
# structure, per-block tone, edge wear, stains, cracks, grain.
#
# Everything periodic is built periodic: FFT noise is periodic by construction,
# layouts wrap on the sheet, distance transforms run on a 3x3 tiling and are
# cropped back to the middle, so no seam is ever painted over.
import sys, os
import numpy as np
from numpy.fft import rfft2, irfft2
from scipy import ndimage
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'public', 'tex', 'dungeon')
SZ = 1024

# metres per sheet (must match PERIOD in client/src/dungeon-kit/themes.ts)
PERIOD = {
    'ashlar': 4, 'rubble': 4, 'brick': 2, 'flags': 4, 'marble': 2, 'planks': 4,
    'timber': 2, 'plaster': 4, 'iron': 2, 'setts': 2, 'tiles': 2,
}


def noise(seed, scale_px, power=2.0, size=SZ):
    """Periodic 1/f^power noise, features ~scale_px wide, normalised to 0..1."""
    r = np.random.default_rng(seed)
    white = r.standard_normal((size, size))
    F = rfft2(white)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.rfftfreq(size)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f0 = 1.0 / max(scale_px, 1)
    filt = 1.0 / (1.0 + (f / f0) ** power)
    filt[0, 0] = 0
    n = irfft2(F * filt, s=(size, size))
    n -= n.min()
    return n / (n.max() + 1e-9)


def wrap_dist(mask):
    """Distance (px) from each True pixel to the nearest False one, periodic."""
    big = np.tile(mask, (3, 3))
    d = ndimage.distance_transform_edt(big)
    h, w = mask.shape
    return d[h:2 * h, w:2 * w]


def normal_from_height(h, strength):
    """OpenGL normal map (green = +V, V up the sheet), periodic gradient."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    # image rows run DOWN the sheet, V runs up: dh/dv = -dh/drow
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], axis=-1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def save(name, rgb, height, strength):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_diff.jpg'), quality=86, optimize=True, progressive=True)
    Image.fromarray(normal_from_height(height, strength)).save(os.path.join(OUT, f'{name}_nor_gl.jpg'), quality=84, optimize=True, progressive=True)
    print('wrote', name)


def bevel(dist, width):
    """0 at the joint, rising to 1 over `width` px with a rounded shoulder."""
    t = np.clip(dist / width, 0, 1)
    return np.sin(t * np.pi / 2) ** 0.8


def block_layout(rows, widths_fn, rng, size=SZ):
    """A coursed layout that wraps: each row's widths sum to the sheet width.
    Returns an id map (int per block) and per-row heights in px."""
    ids = np.zeros((size, size), dtype=np.int32)
    y = 0
    nid = 0
    for rh in rows:
        widths = widths_fn(rng)
        off = rng.integers(0, size)
        x = 0
        for w in widths:
            cols = (np.arange(x, x + w) + off) % size
            ids[y:y + rh][:, cols] = nid
            nid += 1
            x += w
        y += rh
    return ids, nid


def split_widths(total, choices, rng):
    """Random widths from `choices` summing exactly to `total` (px)."""
    out, left = [], total
    while left > 0:
        fit = [c for c in choices if c <= left]
        if not fit:
            out[-1] += left
            break
        c = int(rng.choice(fit))
        if left - c < min(choices) and left - c > 0:
            c = left
        out.append(c)
        left -= c
    return out


def edges_of(ids):
    """True on block interiors, False on the boundary pixels between blocks (periodic)."""
    m = np.ones(ids.shape, bool)
    for ax in (0, 1):
        for s in (1, -1):
            m &= ids == np.roll(ids, s, axis=ax)
    return m


def per_block(values, ids):
    return values[ids]


def tone(rgb, k):
    return np.asarray(rgb, np.float32) * k


# ---------------------------------------------------------------- sheets

def ashlar():
    """Coursed ashlar, 4 m: eight 0.5 m courses, blocks 0.5-2 m, sunk joints,
    a drafted margin on some blocks, chipped arrises, rain/grime streaks."""
    rng = np.random.default_rng(4101)
    ppm = SZ // 4
    rows = [ppm // 2] * 8
    ids, n = block_layout(rows, lambda r: split_widths(SZ, [ppm // 2, int(ppm * .75), ppm, int(ppm * 1.25), int(ppm * 1.5), ppm * 2], r), rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    joint = 3.0
    face = dist > joint
    chip = noise(11, 6, 1.6)
    chipmask = (dist < joint + 7) & (chip > 0.62)  # chipped arrises
    h = bevel(np.maximum(dist - joint, 0), 9) * 0.9
    h -= chipmask * 0.35
    h += (noise(12, 40) - .5) * .18 + (noise(13, 5, 1.2) - .5) * .12
    h = np.where(face, h, 0.05 + noise(14, 3) * .05)
    blk_l = rng.normal(1.0, 0.055, n)
    blk_w = rng.normal(0.0, 0.03, n)       # warm/cool drift per block
    L = per_block(blk_l, ids)[..., None]
    W = per_block(blk_w, ids)
    base = np.stack([196 + W * 160, 190 + W * 40, 178 - W * 120], -1)
    grain = (noise(15, 18, 1.4) - .5) * 26 + (noise(16, 3, 1.0) - .5) * 14
    rgb = base * L + grain[..., None]
    # drafted margins on a third of blocks: a slightly paler tooled band
    drafted = per_block(rng.random(n) < .33, ids) & (dist > joint) & (dist < joint + 14)
    rgb += drafted[..., None] * 9
    # grime: streaks hanging under each course joint, stronger low on the sheet
    streak = noise(17, 30, 2.4)
    streak = np.clip((streak - .55) * 3, 0, 1)
    vert = ndimage.uniform_filter1d(streak, 120, axis=0, mode='wrap')
    rgb -= (vert * 36)[..., None]
    rgb -= (chipmask * 18)[..., None]
    rgb = np.where(face[..., None], rgb, np.array([118, 112, 104]) * (0.85 + noise(18, 4)[..., None] * .2))
    save('ashlar', rgb, h, 5.5)


def rubble():
    """Squared rubble, 4 m: irregular stones in rough courses, deep pointing."""
    rng = np.random.default_rng(4202)
    ppm = SZ // 4
    # jittered points in courses, wider than tall (stretch y by 1.7)
    pts = []
    rows = 14
    for r in range(rows):
        y = (r + .5) * SZ / rows + rng.normal(0, 4)
        x0 = rng.uniform(0, SZ)
        x = 0.0
        while x < SZ - .2 * ppm:
            pts.append(((x0 + x) % SZ, (y + rng.normal(0, 5)) % SZ))
            x += rng.uniform(.22, .55) * ppm
    P = np.array(pts)
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(np.float32)
    best = np.full((SZ, SZ), np.inf, np.float32)
    second = np.full((SZ, SZ), np.inf, np.float32)
    ids = np.zeros((SZ, SZ), np.int32)
    for i, (px, py) in enumerate(P):
        dx = np.abs(xx - px); dx = np.minimum(dx, SZ - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, SZ - dy) * 1.7
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        ids = np.where(closer, i, ids)
        best = np.where(closer, d, best)
    edge = (second - best)  # ~ distance to the Voronoi border, x2
    warp = (noise(21, 20, 1.6) - .5) * 10
    e = edge + warp
    joint = 7
    face = e > joint
    h = np.where(face, bevel(e - joint, 22) * (0.85 + noise(22, 60)[...] * .3), 0.0)
    h += (noise(23, 6, 1.2) - .5) * .2 * face
    n = len(P)
    L = per_block(rng.normal(1, .09, n), ids)[..., None]
    W = per_block(rng.normal(0, .04, n), ids)
    base = np.stack([170 + W * 150, 164 + W * 30, 154 - W * 120], -1)
    rgb = base * L + ((noise(24, 12, 1.3) - .5) * 34)[..., None]
    rgb -= (np.clip(1 - h, 0, 1) * 30)[..., None] * face[..., None]
    damp = np.clip((noise(25, 160, 2.2) - .5) * 2.4, 0, 1)
    rgb -= (damp * 26)[..., None]
    mortar = np.array([104, 100, 92]) * (0.8 + noise(26, 3)[..., None] * .3)
    rgb = np.where(face[..., None], rgb, mortar)
    save('rubble', rgb, h, 7.0)


def brick():
    """English bond, 2 m: stretcher and header courses alternate (0.08 m
    courses, 25 to the sheet), burnt and pale bricks, worn pointing."""
    rng = np.random.default_rng(4303)
    ppm = SZ // 2
    rows = []
    acc = 0
    for r in range(25):
        nxt = round((r + 1) * SZ / 25)
        rows.append(nxt - acc)
        acc = nxt
    stretch, head = ppm // 4, ppm // 8   # 0.25 m and 0.125 m
    flip = iter([(r % 2 == 0) for r in range(25)])
    ids, n = block_layout(rows, lambda r: [stretch] * (SZ // stretch) if next(flip) else [head] * (SZ // head), rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    joint = 3.2
    face = dist > joint
    h = bevel(np.maximum(dist - joint, 0), 4) * .85 + (noise(31, 4, 1.1) - .5) * .18
    h = np.where(face, h, 0.1)
    kind = rng.random(n)
    L = per_block(rng.normal(1, .08, n) * np.where(kind < .1, .62, 1.0) * np.where(kind > .93, 1.18, 1.0), ids)[..., None]
    W = per_block(rng.normal(0, .05, n), ids)
    base = np.stack([200 + W * 120, 150 + W * 40, 124 - W * 60], -1)
    rgb = base * L + ((noise(32, 6, 1.2) - .5) * 30)[..., None]
    bloom = np.clip((noise(33, 90, 2.0) - .62) * 4, 0, 1)   # efflorescence
    rgb = rgb * (1 - bloom[..., None] * .35) + bloom[..., None] * np.array([210, 205, 195]) * .35
    rgb = np.where(face[..., None], rgb, np.array([170, 164, 152]) * (0.78 + noise(34, 3)[..., None] * .25))
    save('brick', rgb, h, 6.0)


def flags():
    """Flagstone floor, 4 m: random-length rows of 0.8-1.2 m slabs, polished
    centres, chipped margins, the odd crack, dirt packed in the joints."""
    rng = np.random.default_rng(4404)
    ppm = SZ // 4
    rows = [int(ppm * .8), ppm, int(ppm * 1.2), ppm]
    rows[-1] = SZ - sum(rows[:-1])
    ids, n = block_layout(rows, lambda r: split_widths(SZ, [int(ppm * .75), ppm, int(ppm * 1.25), int(ppm * 1.5)], r), rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    joint = 3.0
    face = dist > joint
    h = bevel(np.maximum(dist - joint, 0), 14) * .8 + (noise(41, 50) - .5) * .25 + (noise(42, 5, 1.2) - .5) * .1
    # cracks: thin ridged lines in a fifth of slabs
    crack = np.abs(noise(43, 70, 2.6) - .5) < .006
    crack &= per_block(rng.random(n) < .22, ids)
    h -= crack * .4
    h = np.where(face, h, 0.0)
    L = per_block(rng.normal(1, .07, n), ids)[..., None]
    W = per_block(rng.normal(0, .035, n), ids)
    base = np.stack([182 + W * 140, 178 + W * 30, 170 - W * 110], -1)
    wear = bevel(np.maximum(dist - joint, 0), 60)   # polished, paler centres
    rgb = base * L * (0.9 + wear[..., None] * .14) + ((noise(44, 14, 1.3) - .5) * 26)[..., None]
    rgb -= (crack * 50)[..., None]
    rgb -= (np.clip((noise(45, 120, 2) - .55) * 3, 0, 1) * 22)[..., None]
    rgb = np.where(face[..., None], rgb, np.array([70, 66, 60]) * (0.8 + noise(46, 3)[..., None] * .3))
    save('flags', rgb, h, 5.0)


def marble():
    """Veined marble slabs, 2 m: four 1 m slabs, alternate slabs turned so the
    veins cross, hairline joints. Polish is a material property (themes.ts)."""
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(np.float32) / SZ
    t = noise(51, 90, 1.8) * 5 + noise(52, 18, 1.4) * 1.2
    veinA = np.abs(np.sin((xx * 2 + yy * 1) * np.pi * 2 + t * 2.3))
    veinB = np.abs(np.sin((xx * -1 + yy * 2) * np.pi * 2 + t * 2.0 + 1.3))
    slab = ((xx * 2).astype(int) + (yy * 2).astype(int)) % 2
    v = np.where(slab == 0, veinA, veinB)
    vein = np.clip(1 - v / .1, 0, 1) ** 1.6 * .9 + np.clip(1 - v / .3, 0, 1) * .22
    vein *= .55 + noise(54, 50, 1.5) * .9
    cloud = noise(53, 60, 1.6)
    base = np.array([226, 222, 214])
    rgb = base * (0.9 + cloud[..., None] * .12) - (vein[..., None] * np.array([96, 100, 104]))
    gx = (xx * SZ) % (SZ // 2); gy = (yy * SZ) % (SZ // 2)
    joint = (np.minimum(gx, SZ // 2 - gx) < 1.6) | (np.minimum(gy, SZ // 2 - gy) < 1.6)
    rgb = np.where(joint[..., None], rgb * .7, rgb)
    h = 1 - joint * .6 - vein * .03
    save('marble', rgb, h, 3.0)


def planks():
    """Floorboards, 4 m: 0.2 m boards, staggered butt joints, grain along U,
    knots, nail pairs at the joints, wear down the middle of the sheet."""
    rng = np.random.default_rng(4606)
    ppm = SZ // 4
    bw = SZ // 20
    rows = [bw] * 20
    # boards run along U (x): each row split into 1-4 m lengths
    ids, n = block_layout(rows, lambda r: split_widths(SZ, [ppm, int(ppm * 1.5), ppm * 2, ppm * 3], r), rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    face = dist > 1.6
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(np.float32)
    off = per_block(rng.uniform(0, 1000, n), ids)
    gwarp = noise(61, 40, 1.8) * 8
    grain = np.sin((yy * .9 + gwarp + off) * 1.3) * .5 + .5
    fine = noise(62, 2, 1.0)
    # grain is long along x: smear the fine noise along the board
    fine = ndimage.uniform_filter1d(fine, 40, axis=1, mode='wrap')
    L = per_block(rng.normal(1, .1, n), ids)[..., None]
    W = per_block(rng.normal(0, .05, n), ids)
    base = np.stack([178 + W * 120, 138 + W * 50, 98 - W * 40], -1)
    rgb = base * L * (0.86 + grain[..., None] * .12 + fine[..., None] * .1)
    knots = np.clip((noise(63, 10, 2.6) - .8) * 6, 0, 1) * per_block(rng.random(n) < .4, ids)
    rgb -= (knots * 60)[..., None]
    wear = np.clip(1 - np.abs(yy / SZ - .5) * 2.4, 0, 1) * (noise(64, 80) * .6 + .4)
    rgb = rgb * (1 + wear[..., None] * .08)
    h = np.where(face, .8 + grain * .08 + fine * .1 - knots * .1, 0.0)
    rgb = np.where(face[..., None], rgb, np.array([46, 34, 24]))
    save('planks', rgb, h, 4.0)


def timber():
    """Hewn oak for beams and posts, 2 m, grain along U: checks (drying
    cracks), adze facets, no joints, so a swept beam reads as one timber."""
    yy, xx = np.mgrid[0:SZ, 0:SZ].astype(np.float32)
    warp = noise(71, 60, 1.8) * 30
    rings = np.sin((yy + warp) * .25) * .5 + .5
    fine = ndimage.uniform_filter1d(noise(72, 2, 1.0), 60, axis=1, mode='wrap')
    checks = np.abs(ndimage.uniform_filter1d(noise(73, 6, 1.4), 200, axis=1, mode='wrap') - .5) < .006
    adze = noise(74, 45, 2.2)
    base = np.array([150, 112, 78])
    rgb = base * (0.82 + rings[..., None] * .14 + fine[..., None] * .12 + adze[..., None] * .08)
    rgb -= (checks * 55)[..., None]
    h = .7 + rings * .06 + adze * .25 - checks * .5
    save('timber', rgb, h, 4.0)


def plaster():
    """Limewash over rubble, 4 m: soft trowel blotches, hairline cracks and a
    few blown patches where the coursing behind shows through."""
    rng = np.random.default_rng(4808)
    blot = noise(81, 120, 1.9)
    trowel = noise(82, 14, 1.5)
    crack = np.abs(noise(83, 90, 2.8) - .5) < .004
    patch = np.clip((noise(84, 140, 2.4) - .8) * 7, 0, 1) * .8
    # what shows inside a blown patch: small stones
    stone = noise(85, 9, 2.2)
    base = np.array([214, 208, 194])
    rgb = base * (0.9 + blot[..., None] * .1 + trowel[..., None] * .05)
    rgb -= (crack * 60)[..., None]
    under = np.array([168, 156, 138]) * (0.82 + stone[..., None] * .3)
    rgb = rgb * (1 - patch[..., None]) + under * patch[..., None]
    grime = ndimage.uniform_filter1d(np.clip((noise(86, 40, 2) - .5) * 3, 0, 1), 160, axis=0, mode='wrap')
    rgb -= (grime * 22)[..., None]
    h = .8 + trowel * .1 + blot * .05 - patch * (.5 - stone * .3) - crack * .3
    save('plaster', rgb, h, 4.0)


def iron():
    """Riveted iron plate, 2 m: 1 x 0.5 m plates in a lapped bond, rivet rows
    along every seam, rust bleeding down from the rivets, pitting."""
    rng = np.random.default_rng(4909)
    ppm = SZ // 2
    rows = [ppm // 2] * 4
    ids, n = block_layout(rows, lambda r: [ppm, ppm], rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    face = dist > 2
    h = .6 + bevel(dist, 6) * .2
    band = (dist > 9) & (dist < 15)
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    # rivets on a 26 px pitch along the seams
    rr = (np.hypot((xx % 26) - 13, (yy % 26) - 13) < 4.5) & band
    h += rr * .35
    pit = noise(91, 3, 1.0)
    h -= (pit > .7) * .06
    L = per_block(rng.normal(1, .06, n), ids)[..., None]
    base = np.array([112, 110, 108])
    rgb = base * L * (0.9 + noise(92, 30)[..., None] * .2)
    rust = ndimage.uniform_filter1d(rr.astype(np.float32), 90, axis=0, mode='wrap', origin=-40) * 3
    rust = np.clip(rust + (noise(93, 50, 2) - .6) * 2, 0, 1)
    rgb = rgb * (1 - rust[..., None] * .55) + np.array([134, 74, 40]) * rust[..., None] * .55
    rgb -= (rr * 10)[..., None]
    rgb = np.where(face[..., None], rgb, np.array([40, 38, 36]))
    save('iron', rgb, h, 6.0)


def setts():
    """Granite setts, 2 m: 0.2 x 0.125 m domed blocks in stretcher courses,
    for yards, wall-walks and stable floors."""
    rng = np.random.default_rng(5010)
    ppm = SZ // 2
    rows = [ppm // 8] * 16
    ids, n = block_layout(rows, lambda r: split_widths(SZ, [int(ppm * .2), int(ppm * .25), int(ppm * .3)], r), rng)
    inner = edges_of(ids)
    dist = wrap_dist(inner)
    face = dist > 3.5
    h = np.where(face, bevel(dist - 3.5, 16) * (0.8 + noise(101, 20) * .3), 0.0)
    L = per_block(rng.normal(1, .1, n), ids)[..., None]
    W = per_block(rng.normal(0, .05, n), ids)
    base = np.stack([160 + W * 120, 158 + W * 30, 154 - W * 90], -1)
    rgb = base * L + ((noise(102, 4, 1.1) - .5) * 40)[..., None]
    rgb *= (0.86 + h[..., None] * .16)
    rgb = np.where(face[..., None], rgb, np.array([74, 70, 62]) * (0.8 + noise(103, 3)[..., None] * .3))
    save('setts', rgb, h, 6.0)


def tiles():
    """Quarry tiles, 2 m: 0.25 m squares, kiln-varied tone, worn glaze."""
    rng = np.random.default_rng(5111)
    t = SZ // 8
    yy, xx = np.mgrid[0:SZ, 0:SZ]
    ids = (yy // t) * 8 + (xx // t)
    n = 64
    gx, gy = xx % t, yy % t
    dist = np.minimum(np.minimum(gx, t - 1 - gx), np.minimum(gy, t - 1 - gy)).astype(np.float32)
    face = dist > 2.5
    h = np.where(face, bevel(dist - 2.5, 5) * .9 + (noise(111, 8) - .5) * .1, 0.0)
    L = per_block(rng.normal(1, .08, n), ids)[..., None]
    W = per_block(rng.normal(0, .06, n), ids)
    base = np.stack([196 + W * 90, 134 + W * 40, 100 - W * 30], -1)
    rgb = base * L * (0.9 + noise(112, 30)[..., None] * .14)
    worn = np.clip((noise(113, 70, 2) - .55) * 3, 0, 1)
    rgb = rgb * (1 - worn[..., None] * .18)
    rgb = np.where(face[..., None], rgb, np.array([150, 142, 128]) * (0.8 + noise(114, 3)[..., None] * .25))
    save('tiles', rgb, h, 4.0)


SHEETS = {'ashlar': ashlar, 'rubble': rubble, 'brick': brick, 'flags': flags, 'marble': marble,
          'planks': planks, 'timber': timber, 'plaster': plaster, 'iron': iron, 'setts': setts, 'tiles': tiles}

if __name__ == '__main__':
    names = sys.argv[1:] or list(SHEETS)
    for n in names:
        SHEETS[n]()
