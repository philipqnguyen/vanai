"""Signed distance fields for the creature kit: primitives, blends, surface nets.

Pure numpy, no Blender: a body is a tree of SDF nodes evaluated over an (N, 3)
array of points in CREATURE SPACE (metres, y up, +z forward -- the game's own
axes; build.py converts to Blender's at the end).

Why SDFs and not Blender metaballs or the skin modifier: a smooth union with a
per-part blend radius is the one tool that gives sculpted, organic joins (a
neck flowing into a ruff, a thigh into a flank) AND keeps every part
addressable afterwards. The same leaves that shape the surface are asked again
later for the skin weights (which bone a vertex belongs to is which leaves it
is near, weighted the way they blend) and for the paint (which region a texel
sits in, how deep a crease is for the ambient occlusion). One description, three
uses, no drift between them.

Every leaf carries `bone` (who moves it) and `tag` (how it is painted). A leaf
with `weight=False` shapes the surface but never claims a vertex (cuts, the
mouth slit).
"""
from __future__ import annotations

import math
import numpy as np

F = np.float32


def _v(x):
    return np.asarray(x, dtype=np.float64)


def _norm(v):
    v = _v(v)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def rot_from_axes(fwd, up=(0, 1, 0)):
    """A rotation whose local +z is `fwd` and local +y leans to `up`: columns x, y, z."""
    z = _norm(fwd)
    y = _v(up) - np.dot(_v(up), z) * z
    if np.linalg.norm(y) < 1e-6:
        y = np.array([0.0, 0.0, 1.0]) - z[2] * z
    y = _norm(y)
    x = np.cross(y, z)
    return np.stack([x, y, z], axis=1)


def rot_euler(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix from degrees, applied x then y then z."""
    rx, ry, rz = (math.radians(a) for a in (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X


# --------------------------------------------------------------------------- noise

def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144665) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return h


def _grad(h, x, y, z):
    # 12 gradient directions picked from the hash, as in improved Perlin noise
    hh = h % 12
    u = np.where(hh < 8, x, y)
    v = np.where(hh < 4, y, np.where((hh == 12) | (hh == 14), x, z))
    return np.where((hh & 1) == 0, u, -u) + np.where((hh & 2) == 0, v, -v)


def noise3(p, seed=0):
    """Gradient noise in about [-1, 1] at points p (N, 3)."""
    p = np.asarray(p, dtype=np.float64)
    i = np.floor(p).astype(np.int64)
    f = p - i
    u = f * f * f * (f * (f * 6 - 15) + 10)
    out = 0.0
    acc = []
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
                g = _grad(h, f[:, 0] - dx, f[:, 1] - dy, f[:, 2] - dz)
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                acc.append(g * w)
    out = sum(acc)
    return out * 0.9


def fbm(p, octaves=4, seed=0, lac=2.0, gain=0.5):
    p = np.asarray(p, dtype=np.float64)
    amp, tot, norm = 1.0, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * noise3(p, seed + o * 17)
        norm += amp
        p = p * lac
        amp *= gain
    return tot / norm


# --------------------------------------------------------------------------- nodes

class Node:
    def eval(self, P):  # (N,3) -> (N,)
        raise NotImplementedError

    def leaves(self):
        return []


class Leaf(Node):
    """A primitive. `bound` is a conservative axis-aligned box: outside it the
    field is replaced by the distance to the box, a lower bound of the true
    distance, which keeps the sign right and the evaluation cheap."""
    bone = None
    tag = "body"
    weight = True
    pad = 0.0      # the blend radius this leaf joins with (Body.add sets it)

    def __init__(self, bone=None, tag="body", weight=True, displace=None):
        self.bone, self.tag, self.weight = bone, tag, weight
        # displace: (amplitude, frequency, seed, octaves) -- fur clumps, bark, crust
        self.displace = displace

    def lo_hi(self):
        raise NotImplementedError

    def raw(self, P):
        raise NotImplementedError

    def eval(self, P):
        lo, hi = self.lo_hi()
        pad = self.displace[0] if self.displace else 0.0
        lo = lo - pad - 1e-3
        hi = hi + pad + 1e-3
        # Outside the box grown by the blend radius the leaf cannot change a
        # smooth union, so it only needs a lower bound there: the L-inf
        # distance to its box (cheap; it keeps cuts and intersections right).
        k = self.pad
        inside = np.all((P >= lo - k) & (P <= hi + k), axis=1)
        out = np.empty(len(P), dtype=np.float64)
        if (~inside).any():
            Q = P[~inside]
            out[~inside] = np.maximum(lo - Q, Q - hi).max(axis=1)
        if inside.any():
            Q = P[inside]
            d = self.raw(Q)
            if self.displace:
                amp, freq, seed, octv = self.displace
                d = d - amp * fbm(Q * freq, octv, seed)
            out[inside] = d
        return out

    def leaves(self):
        return [self]

    def axis(self):
        """Flow direction for the paint (fur runs along it) -- unit vector."""
        return np.array([0.0, 0.0, -1.0])


class Sphere(Leaf):
    def __init__(self, c, r, **kw):
        super().__init__(**kw)
        self.c, self.r = _v(c), float(r)

    def lo_hi(self):
        return self.c - self.r, self.c + self.r

    def raw(self, P):
        return np.linalg.norm(P - self.c, axis=1) - self.r


class Ellipsoid(Leaf):
    """Ellipsoid with radii (rx, ry, rz) in the frame R (columns are its axes)."""

    def __init__(self, c, radii, R=None, **kw):
        super().__init__(**kw)
        self.c, self.rad = _v(c), _v(radii)
        self.R = np.eye(3) if R is None else _v(R)

    def lo_hi(self):
        ext = np.abs(self.R) @ self.rad
        return self.c - ext, self.c + ext

    def raw(self, P):
        q = (P - self.c) @ self.R  # into the local frame
        k0 = np.linalg.norm(q / self.rad, axis=1)
        k1 = np.linalg.norm(q / (self.rad * self.rad), axis=1)
        return np.where(k1 > 1e-9, k0 * (k0 - 1.0) / np.maximum(k1, 1e-9), -self.rad.min())

    def axis(self):
        return self.R[:, 2]


class Cone(Leaf):
    """IQ's round cone: a capsule from a (radius ra) to b (radius rb). Limbs,
    necks, tails, muzzles, horns and claws are all this one shape."""

    def __init__(self, a, b, ra, rb, **kw):
        super().__init__(**kw)
        self.a, self.b, self.ra, self.rb = _v(a), _v(b), float(ra), float(rb)

    def lo_hi(self):
        r = max(self.ra, self.rb)
        return np.minimum(self.a, self.b) - r, np.maximum(self.a, self.b) + r

    def raw(self, P):
        a, b, r1, r2 = self.a, self.b, self.ra, self.rb
        ba = b - a
        l2 = float(ba @ ba)
        if l2 < 1e-12:
            return np.linalg.norm(P - a, axis=1) - max(r1, r2)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = P - a
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - np.outer(y, ba)
        x2 = np.einsum("ij,ij->i", xv, xv)
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2
        out = np.empty(len(P))
        m1 = np.sign(z) * a2 * z2 > k
        m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
        m3 = ~(m1 | m2)
        out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - r2
        out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - r1
        out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - r1
        return out

    def axis(self):
        return _norm(self.b - self.a)


class Box(Leaf):
    """Rounded box, half extents h, rounding r, frame R."""

    def __init__(self, c, h, r=0.0, R=None, **kw):
        super().__init__(**kw)
        self.c, self.h, self.r = _v(c), _v(h), float(r)
        self.R = np.eye(3) if R is None else _v(R)

    def lo_hi(self):
        ext = np.abs(self.R) @ self.h
        return self.c - ext, self.c + ext

    def raw(self, P):
        q = np.abs((P - self.c) @ self.R) - (self.h - self.r)
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - self.r

    def axis(self):
        return self.R[:, 1]


class Torus(Leaf):
    """Ring of major radius R0 and tube r in the frame's xz plane."""

    def __init__(self, c, R0, r, R=None, **kw):
        super().__init__(**kw)
        self.c, self.R0, self.r = _v(c), float(R0), float(r)
        self.R = np.eye(3) if R is None else _v(R)

    def lo_hi(self):
        ext = np.abs(self.R) @ np.array([self.R0 + self.r, self.r, self.R0 + self.r])
        return self.c - ext, self.c + ext

    def raw(self, P):
        q = (P - self.c) @ self.R
        qx = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2) - self.R0
        return np.sqrt(qx * qx + q[:, 1] ** 2) - self.r


class Bezier(Leaf):
    """A tapered tube along a quadratic/cubic curve, sampled as round cones --
    curling horns, tusks, tails, the Regent's crown tines."""

    def __init__(self, pts, radii, n=8, **kw):
        super().__init__(**kw)
        pts = [_v(p) for p in pts]
        ts = np.linspace(0, 1, n + 1)

        def at(t):
            if len(pts) == 3:
                return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2]
            return ((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2] + t ** 3 * pts[3])

        r0, r1 = radii
        self.segs = [Cone(at(ts[i]), at(ts[i + 1]), r0 + (r1 - r0) * ts[i], r0 + (r1 - r0) * ts[i + 1]) for i in range(n)]
        self.pts = pts

    def lo_hi(self):
        los, his = zip(*(s.lo_hi() for s in self.segs))
        return np.min(los, axis=0), np.max(his, axis=0)

    def raw(self, P):
        return np.min([s.raw(P) for s in self.segs], axis=0)

    def axis(self):
        return _norm(self.pts[-1] - self.pts[0])


# --------------------------------------------------------------------------- combinators

def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Body(Node):
    """An ordered list of (op, leaf-or-node, k): union, sub, inter, applied in
    turn. op 'add' is a smooth union with blend radius k."""

    def __init__(self):
        self.items = []

    def _pad(self, node, k):
        # A blend of radius k reads the field built so far within k of the new
        # node, so every leaf already in the body must be evaluated that far
        # outside its own box too -- not only the new node's leaves. Padding
        # only the new one left the earlier field at BIG there, and the fillet
        # stopped dead at the earlier shape's box: a ledge.
        for lf in node.leaves():
            lf.pad = max(lf.pad, k * 1.5)
        for _, prev, _k in self.items:
            for lf in prev.leaves():
                lf.pad = max(lf.pad, k * 1.5)

    def add(self, node, k=0.0):
        assert not isinstance(node, Xform), "an Xform is a part's top node, never nested in a Body"
        self._pad(node, k)
        self.items.append(("add", node, k))
        return node

    def sub(self, node, k=0.0):
        self._pad(node, k)
        node.weight = False if isinstance(node, Leaf) else getattr(node, "weight", False)
        self.items.append(("sub", node, k))
        return node

    def inter(self, node, k=0.0):
        self._pad(node, k)
        if isinstance(node, Leaf):
            node.weight = False
        self.items.append(("inter", node, k))
        return node

    def eval(self, P):
        """The field at points P, by the same rule as eval_grid: a node only
        touches the points inside its blend reach, so both agree exactly."""
        d = np.full(len(P), BIG)
        first = True
        for op, node, k in self.items:
            lo, hi = _reach(node, k)
            m = np.all((P >= lo) & (P <= hi), axis=1)
            if not m.any():
                if op == "inter":
                    d[:] = BIG
                continue
            v = node.eval(P[m])
            blk = d[m]
            if op == "add":
                d[m] = v if first else smin(blk, v, k)
                first = False
            elif op == "sub":
                d[m] = smax(blk, -v, k)
            else:
                nd = np.full(len(P), BIG)
                nd[m] = smax(blk, v, k)
                d = nd
        return d

    def eval_grid(self, xs, ys, zs):
        """The field on the grid xs x ys x zs (ij indexing), each node touching
        only the block of the grid its blend reach covers: a leaf cannot change
        a smooth union, a cut or (as BIG) an intersection outside it."""
        shape = (len(xs), len(ys), len(zs))
        d = np.full(shape, BIG)
        first = True
        for op, node, k in self.items:
            lo, hi = _reach(node, k)
            sl = _block(xs, ys, zs, lo, hi)
            if sl is None:
                if op == "inter":
                    d[:] = BIG
                continue
            sx, sy, sz = sl
            if isinstance(node, Body):
                v = node.eval_grid(xs[sx], ys[sy], zs[sz])
            else:
                G = np.stack(np.meshgrid(xs[sx], ys[sy], zs[sz], indexing="ij"), -1)
                v = node.eval(G.reshape(-1, 3)).reshape(G.shape[:3])
            blk = d[sx, sy, sz]
            if op == "add":
                d[sx, sy, sz] = v if first else smin(blk, v, k)
                first = False
            elif op == "sub":
                d[sx, sy, sz] = smax(blk, -v, k)
            else:
                nd = np.full(shape, BIG)
                nd[sx, sy, sz] = smax(blk, v, k)
                d = nd
        return d

    def leaves(self):
        out = []
        for op, node, k in self.items:
            out += node.leaves()
        return out

    def bounds(self):
        """The box the added shapes fill (cuts and intersections only shrink it)."""
        los, his = [], []
        for op, node, k in self.items:
            if op != "add":
                continue
            if isinstance(node, (Body, Shell)):
                lo, hi = node.bounds()
                los.append(lo - k)
                his.append(hi + k)
                continue
            for lf in node.leaves():
                lo, hi = lf.lo_hi()
                pad = (lf.displace[0] if lf.displace else 0.0) + k
                los.append(lo - pad)
                his.append(hi + pad)
        return np.min(los, axis=0), np.max(his, axis=0)


BIG = 10.0


def _reach(node, k):
    """The box outside of which node cannot affect a blend of radius k."""
    los, his = [], []
    for lf in node.leaves():
        lo, hi = lf.lo_hi()
        pad = (lf.displace[0] if lf.displace else 0.0) + 1.5 * max(k, lf.pad) + 1e-3
        los.append(lo - pad)
        his.append(hi + pad)
    return np.min(los, axis=0), np.max(his, axis=0)


def _block(xs, ys, zs, lo, hi):
    out = []
    for a, l, h in ((xs, lo[0], hi[0]), (ys, lo[1], hi[1]), (zs, lo[2], hi[2])):
        i0 = int(np.searchsorted(a, l, "left"))
        i1 = int(np.searchsorted(a, h, "right"))
        if i1 <= i0:
            return None
        out.append(slice(i0, i1))
    return out


class Xform(Node):
    """A node moved rigidly: world = R p + t. Lets a weapon be authored where the
    hand holds it in the carry pose, then carried back to the rest pose."""

    def __init__(self, node, R, t):
        self.node, self.R, self.t = node, np.asarray(R, float), np.asarray(t, float)

    def eval(self, P):
        return self.node.eval((P - self.t) @ self.R)

    def leaves(self):
        return self.node.leaves()

    def bounds(self):
        lo, hi = self.node.bounds() if hasattr(self.node, "bounds") else self.node.lo_hi()
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        w = corners @ self.R.T + self.t
        return w.min(0), w.max(0)


class Shell(Node):
    """A hollow skin of thickness t around a node: curved armour plates,
    pauldrons, the cuirass -- cut down afterwards with inter/sub."""

    def __init__(self, node, t):
        self.node, self.t = node, float(t)
        for lf in node.leaves():  # the skin stands t outside the leaf's own box
            lf.pad = max(lf.pad, t)

    def eval(self, P):
        return np.abs(self.node.eval(P)) - self.t

    def leaves(self):
        return self.node.leaves()

    def bounds(self):
        if isinstance(self.node, Body):
            lo, hi = self.node.bounds()
        else:
            lo, hi = self.node.lo_hi()
        return lo - self.t, hi + self.t


# --------------------------------------------------------------------------- meshing

def surface_nets(field, lo, hi, voxel, project=None, iters=3):
    """Polygonize field(P)=0 inside [lo, hi] with naive surface nets: one vertex
    per cell the surface crosses, one quad per crossed grid edge. Vertices are
    then pulled onto the true surface along the field gradient (`project`
    iterations), which is what makes a coarse-ish grid read as sculpted.

    Returns (verts (V,3), quads (Q,4)) with quads wound counter-clockwise seen
    from outside (positive field side)."""
    lo, hi = tight_bounds(field, lo, hi, voxel)
    lo, hi = tight_bounds(field, lo, hi, voxel)
    lo = np.asarray(lo, float) - 2 * voxel
    hi = np.asarray(hi, float) + 2 * voxel
    n = np.ceil((hi - lo) / voxel).astype(int) + 1
    xs = [lo[i] + np.arange(n[i]) * voxel for i in range(3)]
    owner = getattr(field, "__self__", None)
    if isinstance(owner, Body):
        V = owner.eval_grid(*xs)
    else:
        G = np.stack(np.meshgrid(*xs, indexing="ij"), axis=-1).reshape(-1, 3)
        V = field(G).reshape(n)
    s = V < 0
    nx, ny, nz = n
    # cell corner signs
    c = np.zeros((nx - 1, ny - 1, nz - 1), dtype=np.uint8)
    corners = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
    for bit, (dx, dy, dz) in enumerate(corners):
        c |= (s[dx:nx - 1 + dx, dy:ny - 1 + dy, dz:nz - 1 + dz].astype(np.uint8) << bit)
    active = (c != 0) & (c != 255)
    idx = np.full(c.shape, -1, dtype=np.int64)
    ai = np.argwhere(active)
    idx[active] = np.arange(len(ai))
    # vertex = mean of edge crossings around the cell
    acc = np.zeros((len(ai), 3))
    cnt = np.zeros(len(ai))
    edges = [((0, 0, 0), (1, 0, 0)), ((0, 1, 0), (1, 1, 0)), ((0, 0, 1), (1, 0, 1)), ((0, 1, 1), (1, 1, 1)),
             ((0, 0, 0), (0, 1, 0)), ((1, 0, 0), (1, 1, 0)), ((0, 0, 1), (0, 1, 1)), ((1, 0, 1), (1, 1, 1)),
             ((0, 0, 0), (0, 0, 1)), ((1, 0, 0), (1, 0, 1)), ((0, 1, 0), (0, 1, 1)), ((1, 1, 0), (1, 1, 1))]
    i, j, k = ai[:, 0], ai[:, 1], ai[:, 2]
    for (a, b) in edges:
        va = V[i + a[0], j + a[1], k + a[2]]
        vb = V[i + b[0], j + b[1], k + b[2]]
        cross = (va < 0) != (vb < 0)
        t = np.where(cross, va / np.where(cross, va - vb, 1), 0)
        pa = np.stack([i + a[0], j + a[1], k + a[2]], 1).astype(float)
        pb = np.stack([i + b[0], j + b[1], k + b[2]], 1).astype(float)
        p = pa + (pb - pa) * t[:, None]
        acc += np.where(cross[:, None], p, 0)
        cnt += cross
    verts = lo + voxel * (acc / np.maximum(cnt, 1)[:, None])
    # quads: one per crossed edge, between the 4 cells that share it
    quads = []
    for axis in range(3):
        o1, o2 = [(1, 2), (2, 0), (0, 1)][axis]
        sl_a = [slice(0, n[0]), slice(0, n[1]), slice(0, n[2])]
        sl_b = list(sl_a)
        sl_a[axis] = slice(0, n[axis] - 1)
        sl_b[axis] = slice(1, n[axis])
        sa = s[tuple(sl_a)]
        sb = s[tuple(sl_b)]
        e = np.argwhere(sa != sb)
        # the edge must have the 4 surrounding cells inside the grid
        ok = (e[:, o1] >= 1) & (e[:, o2] >= 1) & (e[:, o1] < n[o1] - 1) & (e[:, o2] < n[o2] - 1)
        e = e[ok]
        inside_first = sa[tuple(e.T)]
        def cell(d1, d2):
            q = e.copy()
            q[:, o1] -= d1
            q[:, o2] -= d2
            return idx[q[:, 0], q[:, 1], q[:, 2]]
        c00, c10, c11, c01 = cell(1, 1), cell(0, 1), cell(0, 0), cell(1, 0)
        q = np.stack([c00, c10, c11, c01], 1)
        # wind outward: flip where the inside is on the far end of the edge
        q[~inside_first] = q[~inside_first][:, ::-1]
        quads.append(q)
    quads = np.concatenate(quads)
    quads = quads[(quads >= 0).all(1)]
    if project:
        for _ in range(iters):
            verts = project_to_surface(field, verts, voxel * 0.5)
    return verts, quads


def tight_bounds(field, lo, hi, voxel):
    """Shrink [lo, hi] to where the surface actually is, from a coarse pass: a
    quarter of a robe or a cut-down plate has the bounds of the whole shape it
    was cut from, and meshing all of that at the fine voxel is most of the cost."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    c = max(voxel * 4, float((hi - lo).max()) / 90)
    n = np.ceil((hi - lo) / c).astype(int) + 1
    xs = [lo[i] + np.arange(n[i]) * c for i in range(3)]
    owner = getattr(field, "__self__", None)
    if isinstance(owner, Body):
        V = owner.eval_grid(*xs)
    else:
        G = np.stack(np.meshgrid(*xs, indexing="ij"), axis=-1).reshape(-1, 3)
        V = field(G).reshape(n)
    occ = np.argwhere(V < c * 1.5)
    if not len(occ):
        return lo, hi
    a = np.array([xs[i][occ[:, i].min()] for i in range(3)]) - 2 * c
    b = np.array([xs[i][occ[:, i].max()] for i in range(3)]) + 2 * c
    return np.maximum(a, lo), np.minimum(b, hi)


def gradient(field, P, h):
    ex = np.array([h, 0, 0])
    ey = np.array([0, h, 0])
    ez = np.array([0, 0, h])
    g = np.stack([field(P + ex) - field(P - ex), field(P + ey) - field(P - ey), field(P + ez) - field(P - ez)], 1)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    return g / np.maximum(n, 1e-9)


def project_to_surface(field, P, h):
    d = field(P)
    g = gradient(field, P, h)
    step = np.clip(d, -h * 2, h * 2)
    return P - g * step[:, None]


def outward_check(verts, quads):
    """Signed volume of the closed mesh; positive when faces wind outward."""
    tri = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    a, b, c = verts[tri[:, 0]], verts[tri[:, 1]], verts[tri[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)
