"""The painted atlas (numpy): rasterize the LOD0 mesh into its UV layout, then
paint every texel from the creature's 3D description.

Each covered texel knows where it sits on the body (its rest-pose 3D point),
which way it faces, and which part it belongs to. Painting then asks the SDF
leaves the questions a painter answers by eye: which region is this (coat,
belly, muzzle, eye), how deep a crease is it in (ambient occlusion straight off
the distance field), is it a ridge or a hollow (convexity), which way does the
fur run here (the axis of the nearest leaf). Because every input is a function
of 3D position, the paint has no UV seams: an island edge in the atlas is
invisible on the body.

A spec's paint(ctx) returns colours in sRGB 0..1 for ctx's texels (and
optionally an emissive colour and metal/rough values); this module does the
rest -- the island bleed so mipmaps never pull in the background, and the
images.
"""
from __future__ import annotations

import numpy as np

import sdf


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def mix(a, b, t):
    t = np.asarray(t, float)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1 - t) + b * t


def sstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rasterize(tuv, size):
    """Per texel: the triangle covering it (-1 for none) and its barycentrics.
    Texel (row, col) samples u = (col + .5)/size, v = 1 - (row + .5)/size."""
    tri = np.full((size, size), -1, dtype=np.int64)
    bary = np.zeros((size, size, 3), dtype=np.float64)
    px = np.empty_like(tuv)
    px[..., 0] = tuv[..., 0] * size - 0.5
    px[..., 1] = (1.0 - tuv[..., 1]) * size - 0.5
    for t in range(len(tuv)):
        (x0, y0), (x1, y1), (x2, y2) = px[t]
        xmin = max(int(np.floor(min(x0, x1, x2))), 0)
        xmax = min(int(np.ceil(max(x0, x1, x2))), size - 1)
        ymin = max(int(np.floor(min(y0, y1, y2))), 0)
        ymax = min(int(np.ceil(max(y0, y1, y2))), size - 1)
        if xmax < xmin or ymax < ymin:
            continue
        xs = np.arange(xmin, xmax + 1)
        ys = np.arange(ymin, ymax + 1)
        X, Y = np.meshgrid(xs, ys)
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12:
            continue
        a = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / den
        b = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / den
        c = 1 - a - b
        e = -0.02  # a hair of overlap so shared edges leave no pinholes
        m = (a >= e) & (b >= e) & (c >= e)
        if not m.any():
            continue
        rows, cols = Y[m], X[m]
        tri[rows, cols] = t
        bb = np.stack([a[m], b[m], c[m]], 1)
        bary[rows, cols] = np.clip(bb, 0, 1) / np.clip(bb, 0, 1).sum(1, keepdims=True)
    return tri, bary


def bleed(img, filled, iters=12):
    """Grow painted islands outward into the empty atlas so bilinear filtering
    and mipmaps at an island edge sample the island's own colour."""
    img = img.copy()
    filled = filled.copy()
    for _ in range(iters):
        acc = np.zeros_like(img)
        cnt = np.zeros(filled.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(img, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = (~filled) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        filled = filled | grow
    # anything still empty takes the mean, so the JPEG has no hard black blocks
    if (~filled).any():
        img[~filled] = img[filled].mean(0)
    return img


def exact_within(spec, margin):
    """Make every leaf's field exact out to `margin` beyond its box.

    Leaf.eval answers only a lower bound (the L-inf distance to its box) past
    its blend pad. That is all the mesher needs, but the paint asks about
    points off the skin -- occlusion and convexity probe centimetres out, and
    the region and flow weights compare every leaf's distance at a texel --
    and where a probe crosses a leaf's box face the answer jumps. The jumps
    painted the boxes onto the creatures: mottled plate and ringed robes
    from the occlusion, dark rectangles on fur from the regions (reported by
    three of the rollout's groups, 2026-10-13, each working round it in its
    own plan). Widening the pads is safe at paint time: the mesh is built,
    and past `margin` the bound is itself at least `margin`, which is as far
    as anything here looks. Pads only grow, so asking twice is free."""
    for node in [spec.body] + [p.node for p in spec.parts]:
        for lf in node.leaves():
            if lf.pad < margin:
                lf.pad = margin


def tag_reach(spec):
    """How far past a leaf the region and flow weights need its distance
    exact: about a tenth of the creature's largest extent (the regions'
    softness is a few centimetres per metre of creature)."""
    lo, hi = spec.body.bounds()
    return max(0.05, 0.1 * float(np.max(hi - lo)))


class Ctx:
    """The texels being painted and the questions a paint function may ask."""

    def __init__(self, spec, P, N, part, size):
        self.spec, self.P, self.N, self.part, self.size = spec, P, N, part, size
        self.M = len(P)
        self._ld = None
        exact_within(spec, tag_reach(spec))

    # -- selection
    def on(self, *names):
        ids = [self.spec.part_id(n) for n in names]
        return np.isin(self.part, ids)

    # -- the organic body's leaves
    def leaf_dists(self):
        if self._ld is None:
            org = self.on("body")
            L = self.spec.body.leaves()
            D = np.full((self.M, len(L)), np.inf)
            if org.any():
                Q = self.P[org]
                for i, lf in enumerate(L):
                    if lf.weight:
                        D[org, i] = lf.eval(Q)
            self._ld = D
        return self._ld

    def tag(self, *tags, soft=0.02):
        """Soft membership in the regions whose leaves carry one of `tags`."""
        D = self.leaf_dists()
        L = self.spec.body.leaves()
        dmin = D.min(1, keepdims=True)
        dmin = np.where(np.isfinite(dmin), dmin, 0)
        w = np.exp(-np.clip(D - dmin, 0, 50) / soft)
        w[~np.isfinite(D)] = 0
        sel = np.array([lf.tag in tags for lf in L])
        tot = w.sum(1)
        out = np.where(tot > 0, w[:, sel].sum(1) / np.maximum(tot, 1e-9), 0)
        return out

    def flow(self):
        """Per texel the direction the fur runs: the nearest leaves' axes, blended."""
        D = self.leaf_dists()
        L = self.spec.body.leaves()
        A = np.array([lf.axis() for lf in L])
        dmin = D.min(1, keepdims=True)
        dmin = np.where(np.isfinite(dmin), dmin, 0)
        w = np.exp(-np.clip(D - dmin, 0, 50) / 0.03)
        w[~np.isfinite(D)] = 0
        f = w @ A
        n = np.linalg.norm(f, axis=1, keepdims=True)
        f = np.where(n > 1e-6, f / np.maximum(n, 1e-9), np.array([0, 0, -1.0]))
        return f

    # -- fields
    def field(self, Q):
        return self.spec.field_all(Q)

    def ao(self, step=0.02, n=5, strength=1.0, own=False):
        """Ambient occlusion from the distance field: how much of the space
        just off the surface is taken up by the body itself.

        own=True occludes each part's texels by the organic body and that part
        only. Overlapping thin shells (a sleeve under a bell cuff, robe quarters
        over an underskirt) otherwise sample deep inside each other, and the
        occlusion traces the neighbour's distance contours as rings."""
        exact_within(self.spec, step * n * 1.05)
        occ = np.zeros(self.M)
        if own:
            groups = [(self.part == pid, (lambda Q, pid=pid: np.minimum(self.spec.body.eval(Q), self.spec.parts[pid - 1].node.eval(Q))) if pid else self.spec.body.eval)
                      for pid in np.unique(self.part)]
        else:
            groups = [(np.ones(self.M, bool), self.field)]
        for m, f in groups:
            for k in range(1, n + 1):
                h = step * k
                d = f(self.P[m] + self.N[m] * h)
                occ[m] += np.clip(h - d, 0, None) / (2.0 ** (k - 1))
        ao = np.clip(1 - strength * occ / step, 0, 1)
        # Joints deform: an armpit or the back of a knee opens in the stride,
        # and occlusion baked there shows as a dark smear on the opened skin.
        # Where the skin is shared between bones, keep only a third of it.
        j = self.jointness()
        return 1 - (1 - ao) * (1 - 0.65 * j)

    def jointness(self):
        """0 where one bone owns the skin, toward 1 where two share it evenly
        (the organic body's texels; rigid parts move as one)."""
        if getattr(self, "_joint", None) is None:
            D = self.leaf_dists()
            L = self.spec.body.leaves()
            bones = sorted({lf.bone for lf in L if lf.weight and lf.bone})
            j = np.zeros(self.M)
            org = np.isfinite(D).any(1)
            if org.any() and bones:
                W = np.zeros((org.sum(), len(bones)))
                for i, lf in enumerate(L):
                    if not lf.weight or not lf.bone:
                        continue
                    s = getattr(lf, "falloff", None) or self.spec.falloff
                    w = np.exp(-(np.maximum(D[org, i], 0) / s) ** 2)
                    b = bones.index(lf.bone)
                    W[:, b] = np.maximum(W[:, b], w)
                W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
                top = -np.sort(-W, axis=1)
                second = top[:, 1] if top.shape[1] > 1 else np.zeros(len(top))
                j[org] = np.clip(second / 0.5, 0, 1)
            self._joint = j
        return self._joint

    def convex(self, h=0.012):
        """+ on ridges and edges, - in hollows, about 0 on flats."""
        exact_within(self.spec, h * 1.05)
        d_in = self.field(self.P - self.N * h)
        d_out = self.field(self.P + self.N * h)
        return np.clip((d_in + d_out) / h, -1, 1)

    def noise(self, freq, octaves=3, seed=0, P=None):
        P = self.P if P is None else P
        return sdf.fbm(P * freq, octaves, seed)

    def streaks(self, f_along, f_across, octaves=3, seed=0):
        """Noise stretched along the fur flow: fine across, long along."""
        f = self.flow()
        along = np.einsum("ij,ij->i", self.P, f)
        perp = self.P - along[:, None] * f
        Q = perp * f_across + (along * f_along)[:, None] * f
        return sdf.fbm(Q, octaves, seed)

    def up(self):
        return self.N[:, 1]


def project_to_pieces(spec, P, N, part, reach=None, k=12):
    """Move each texel along its normal to where its piece's field crosses
    from inside to outside, nearest the facet; then bisect. Returns P, N."""
    P, N = P.copy(), N.copy()
    D = reach if reach is not None else 6.0 * spec.body_voxel
    ts = np.linspace(-D, D, k)
    for pid in np.unique(part):
        m = np.nonzero(part == pid)[0]
        f = spec.body.eval if pid == 0 else spec.parts[pid - 1].node.eval
        Q, Nq = P[m], N[m]
        F = np.stack([f(Q + Nq * tt) for tt in ts], 1)
        cross = (F[:, :-1] < 0) & (F[:, 1:] >= 0)
        # of the crossings, the one nearest the facet
        dist = np.where(cross, np.abs(0.5 * (ts[:-1] + ts[1:]))[None, :], np.inf)
        i = dist.argmin(1)
        ok = np.isfinite(dist[np.arange(len(m)), i])
        lo, hi = ts[i], ts[i + 1]
        for _ in range(6):
            mid = 0.5 * (lo + hi)
            fm = f(Q + Nq * mid[:, None])
            lo = np.where(fm < 0, mid, lo)
            hi = np.where(fm < 0, hi, mid)
        t = 0.5 * (lo + hi)
        Qn = Q + Nq * np.where(ok, t, 0.0)[:, None]
        h = 0.0012
        g = np.stack([f(Qn + e) - f(Qn - e) for e in np.eye(3) * h], 1)
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        good = ok & (np.einsum("ij,ij->i", g, Nq) > 0.0)
        P[m] = np.where(ok[:, None], Qn, Q)
        N[m] = np.where(good[:, None], g, Nq)
    return P, N


def paint_atlas(spec, obj_tris, size, ss=1):
    """Rasterize and paint. obj_tris from blend.mesh_tris. Returns dict of
    images (H, W, 3) in sRGB: base, and emissive / mr if the spec paints them."""
    P, tv, tuv, N, tpart, CN = obj_tris
    tri, bary = rasterize(tuv, size)
    cov = tri >= 0
    t = tri[cov]
    b = bary[cov]
    Pt = np.einsum("ij,ijk->ik", b, P[tv[t]])
    Nt = np.einsum("ij,ijk->ik", b, CN[t])
    Nt /= np.maximum(np.linalg.norm(Nt, axis=1, keepdims=True), 1e-9)
    # Paint the true surface, not the decimated one. A flat facet stands for
    # a curve: it sits millimetres inside a limb and, across a big thin shell
    # (a robe quarter, a cape), cuts right through the cloth, so occlusion,
    # convexity and region tests read every facet as a crease or a band. As in
    # a cage bake, each texel is carried along its mesh normal onto the outer
    # surface of its OWN piece (the body, or its part -- never a neighbour it
    # is tucked under), and that surface's gradient is the normal to shade by.
    Pt, Nt = project_to_pieces(spec, Pt, Nt, tpart[t])
    ctx = Ctx(spec, Pt, Nt, tpart[t], size)
    out = spec.paint(ctx)
    if isinstance(out, tuple):
        rgb, extra = out
    else:
        rgb, extra = out, {}
    imgs = {}
    base = np.zeros((size, size, 3))
    base[cov] = np.clip(rgb, 0, 1)
    imgs["base"] = bleed(base, cov)
    if extra.get("emit") is not None:
        em = np.zeros((size, size, 3))
        em[cov] = np.clip(extra["emit"], 0, 1)
        imgs["emit"] = bleed(em, cov)
    if extra.get("rough") is not None:
        mr = np.zeros((size, size, 3))
        mr[cov, 0] = 1.0
        mr[cov, 1] = np.clip(extra["rough"], 0.04, 1)
        mr[cov, 2] = np.clip(extra.get("metal", np.zeros(ctx.M)), 0, 1)
        imgs["mr"] = bleed(mr, cov)
    imgs["coverage"] = float(cov.mean())
    return imgs


# --------------------------------------------------------------------------- palette variants
#
# A look is painted once in its own palette; a variant (bestiary_plan.json:
# a wearer whose palette or crusts differ) is the same paint function run with
# its colours moved. The plan gives three colours per palette -- the main coat
# or plate, the dark, the accent (eyes, lamps) -- and the look's base palette.
# Shifting each of the look's painted colours by the base->variant difference
# in Lab keeps every contrast the painter set (a pale belly stays paler than
# the back), lightens as readily as it darkens, and turns a hue cleanly; a
# multiply over the finished atlas can do none of those.

def _srgb_to_lab(c):
    c = np.asarray(c, float)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _lab_to_srgb(lab):
    lab = np.asarray(lab, float)
    fy = (lab[..., 0] + 16) / 116
    fx, fz = fy + lab[..., 1] / 500, fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    lin = np.clip(xyz @ M.T, 0, 1)
    return np.clip(np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055), 0, 1)


def to_hex(c):
    return "#" + "".join(f"{int(round(v * 255)):02x}" for v in np.clip(c, 0, 1))


def lab_shift(hex_color, from_hex, to_hex_, amount=1.0):
    """hex_color moved by the Lab difference from_hex -> to_hex_ (chroma scaled
    with it, so a grey look takes a strong hue when the variant is strongly
    coloured)."""
    c, a, b = (_srgb_to_lab(hexc(h)) for h in (hex_color, from_hex, to_hex_))
    out = c + (b - a) * amount
    ca, cb = np.hypot(a[1], a[2]), np.hypot(b[1], b[2])
    if ca > 4:
        # a coloured base: the colour's offset from the base keeps its
        # direction and scales with the variant's chroma, so the base colour
        # lands exactly on the variant's and its neighbours keep their spread
        out[1:] = (1 - amount) * c[1:] + amount * (b[1:] + (c[1:] - a[1:]) * (cb / ca))
    out[0] = np.clip(out[0], 0, 100)
    return to_hex(_lab_to_srgb(out))


def variant_palette(pal, variant, groups):
    """The look's palette dict for a variant. groups maps each of the plan's
    three palette slots to the look's keys that follow it, e.g. for the wolf
    {0: ["back", "flank", "belly"], 2: ["eye"]}; a key listed under slot 2
    as accent takes the variant's accent outright when `direct` is set:
    {"direct": {2: ["eye"]}}. Keys in no group keep their colour."""
    if not variant:
        return dict(pal)
    out = dict(pal)
    base, new = variant["base_palette"], variant["palette"]
    for slot, keys in groups.items():
        if slot == "direct":
            continue
        for k in keys:
            out[k] = lab_shift(pal[k], base[slot], new[slot])
    for slot, keys in groups.get("direct", {}).items():
        if base[slot].lower() != new[slot].lower():
            for k in keys:
                out[k] = new[slot]
    return out


def crust(ctx, kind, mask, rgb, s=1.0, seed=0):
    """Paint a crust over rgb where mask (0..1) allows it; returns (rgb, emit
    add). The plan's crusts: ash, glass, bark, frost, amber, iron, slag, moss,
    weed, silt, silver, melt-glass."""
    M = ctx.M
    n = ctx.noise(6.0 / s, 3, 300 + seed)
    patch = sstep(0.05, 0.35, n) * mask
    emit = np.zeros((M, 3))
    up = sstep(-0.1, 0.7, ctx.N[:, 1])
    if kind in ("ash",):
        rgb = mix(rgb, np.array([0.55, 0.53, 0.50]) * (1 + 0.15 * ctx.noise(40 / s, 2, 301 + seed))[:, None], patch * 0.85)
    elif kind in ("glass", "melt-glass"):
        fleck = sstep(0.55, 0.62, ctx.noise(55 / s, 1, 302 + seed)) * mask
        rgb = mix(rgb, np.array([0.80, 0.86, 0.88]), fleck * 0.9)
        emit = emit + np.array([0.25, 0.32, 0.36]) * fleck[:, None] * 0.5
    elif kind == "bark":
        rgb = mix(rgb, mix(np.tile([0.36, 0.28, 0.20], (M, 1)), np.array([0.2, 0.15, 0.11]), sstep(-0.3, 0.6, ctx.streaks(3, 40, 2, 303 + seed))), patch * 0.9)
    elif kind in ("frost", "frosted"):
        rgb = mix(rgb, np.array([0.90, 0.95, 1.0]), np.clip(up * 0.8 + patch * 0.4, 0, 1) * mask * 0.85)
    elif kind == "amber":
        rgb = mix(rgb, np.array([0.80, 0.52, 0.16]) * (1 + 0.25 * ctx.noise(20 / s, 2, 304 + seed))[:, None], patch * 0.9)
        emit = emit + np.array([0.35, 0.18, 0.04]) * patch[:, None] * 0.35
    elif kind == "iron":
        rgb = mix(rgb, mix(np.tile([0.30, 0.28, 0.27], (M, 1)), np.array([0.48, 0.24, 0.12]), sstep(-0.2, 0.5, ctx.noise(30 / s, 2, 305 + seed))), patch * 0.9)
    elif kind == "slag":
        rgb = mix(rgb, np.array([0.16, 0.13, 0.12]), patch * 0.9)
        seam = sstep(0.62, 0.7, ctx.noise(22 / s, 2, 306 + seed)) * patch
        emit = emit + np.array([1.0, 0.42, 0.12]) * seam[:, None] * 0.8
        rgb = mix(rgb, np.array([0.95, 0.45, 0.15]), seam * 0.8)
    elif kind in ("moss", "weed"):
        rgb = mix(rgb, np.array([0.30, 0.40, 0.18]) * (1 + 0.2 * ctx.noise(35 / s, 2, 307 + seed))[:, None], np.clip(patch * (0.5 + 0.5 * up), 0, 1) * 0.9)
    elif kind == "silt":
        rgb = mix(rgb, np.array([0.48, 0.42, 0.32]), patch * 0.8)
    elif kind == "silver":
        rgb = mix(rgb, np.array([0.80, 0.82, 0.86]), patch * 0.7)
    return rgb, emit
