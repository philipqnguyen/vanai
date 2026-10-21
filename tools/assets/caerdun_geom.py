"""Pure-python geometry for Caerdun's Sea Gate modules (no bpy), promoted from the
approved mock-up's geo.py (tmp/caerdun-redesign/mockups/sea-gate, direction C,
CF-1): polygons in GAME coordinates (x along, y up, +z the module's front),
box-projected or explicit UVs into caerdun_atlas.py's regions, faces cut where a
strip's tile repeats, and the architectural primitives -- walls with openings,
arcaded machicolation strips, corner wedges, straight flights, decks with holes.
build_caerdun_modules.py turns a Geo into Blender meshes.

Orientation: every polygon is handed an outward hint and flipped to match it, so
winding is never guessed. Game coordinates are right-handed here; the builder
stores them in Blender as (x, -z, y), a proper rotation, so CCW stays CCW and the
exporter maps them straight back.

Determinism: no randomness here at all, and every texture coordinate is snapped to
a 2^-15 grid (0.06 px on a 2048 sheet) as it is made, so a rebuild is
byte-identical and a diff shows only real changes (CITY-BUILD's bevelled-box trap).

The contract's datums (section 2 and 3.5 of CAERDUN-CONTRACT.md, copied from
tools/data/caerdun_contract.json, never imported) are at the end of this file: the
modules build their walks, rooms, doors and flights exactly on them, and the
manifest records them for caerdun_modules.test.mjs to hold to its own copy.
"""
import math
import caerdun_atlas as A

SNAP = 32768.0

EPS = 1e-7


# ------------------------------------------------------------------ vectors
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))
def norm(a):
    l = length(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > EPS else (0.0, 0.0, 0.0)
def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))
def lin(a, b, n): return [a + (b - a) * i / n for i in range(n + 1)]


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return tuple(n)


def earclip(p):
    """Triangulate a simple 2D polygon; returns index triples."""
    n = len(p)
    if n == 3:
        return [(0, 1, 2)]
    area = sum(p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]

    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    out = []
    guard = 0
    while len(idx) > 3 and guard < 5000:
        guard += 1
        m = len(idx)
        ear = None
        for i in range(m):
            a, b, c = idx[i - 1], idx[i], idx[(i + 1) % m]
            if cr(p[a], p[b], p[c]) <= 1e-12:
                continue
            ok = True
            for j in idx:
                if j in (a, b, c) or p[j] in (p[a], p[b], p[c]):
                    continue
                if cr(p[a], p[b], p[j]) > 1e-12 and cr(p[b], p[c], p[j]) > 1e-12 and cr(p[c], p[a], p[j]) > 1e-12:
                    ok = False
                    break
            if ok:
                ear = i
                break
        if ear is None:
            for i in range(m):
                a, b, c = idx[i - 1], idx[i], idx[(i + 1) % m]
                if abs(cr(p[a], p[b], p[c])) <= 1e-10:
                    idx.pop(i)
                    break
            else:
                out += [(idx[0], idx[k], idx[k + 1]) for k in range(1, len(idx) - 1)]
                return out
            continue
        a, b, c = idx[ear - 1], idx[ear], idx[(ear + 1) % m]
        out.append((a, b, c))
        idx.pop(ear)
    if len(idx) == 3:
        out.append(tuple(idx))
    return out


def _convex(p):
    """A simple 2D polygon is convex: every turn the same way (collinear allowed)."""
    n = len(p)
    if n == 3:
        return True
    sgn = 0
    for i in range(n):
        o, a, b = p[i], p[(i + 1) % n], p[(i + 2) % n]
        c = (a[0] - o[0]) * (b[1] - a[1]) - (a[1] - o[1]) * (b[0] - a[0])
        if abs(c) <= 1e-12:
            continue
        s = 1 if c > 0 else -1
        if sgn == 0:
            sgn = s
        elif s != sgn:
            return False
    return True


def split_poly(poly, L):
    """Split a convex polygon of (x,y,z,u,v) at v = L into (below, above)."""
    below, above = [], []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if a[4] <= L + 1e-9:
            below.append(a)
        if a[4] >= L - 1e-9:
            above.append(a)
        if (a[4] - L) * (b[4] - L) < -1e-12:
            t = (L - a[4]) / (b[4] - a[4])
            m = lerp(a, b, t)
            below.append(m)
            above.append(m)
    return below, above


# ------------------------------------------------------------------ the mesh accumulator
class Geo:
    def __init__(self, name):
        self.name = name
        self.tris = {}          # material -> [(P0,P1,P2), (uv0,uv1,uv2), tint, smooth]
        self.grad = (0.0, 12.0, 0.84)
        self.ground = 0.0       # y of a bake-only ground plane (None: no plane)
        self.ao = 1.6           # AO bake distance (m)

    def poly(self, pts, surf, n=None, st=None, tint=1.0, smooth=False, uvf=None, voff=0.0, tintf=None):
        pts = [tuple(float(c) for c in p) for p in pts]
        # drop repeated points
        q, qst = [], []
        for i, p in enumerate(pts):
            if not q or length(sub(p, q[-1])) > 1e-6:
                q.append(p)
                qst.append(st[i] if st else None)
        while len(q) > 1 and length(sub(q[0], q[-1])) <= 1e-6:
            q.pop()
            qst.pop()
        if len(q) < 3:
            return
        nn = newell(q)
        if length(nn) < 1e-9:
            return
        if n is not None and dot(nn, n) < 0:
            q.reverse()
            qst.reverse()
            nn = mul(nn, -1)
        nh = norm(nn)
        reg = A.REGIONS[surf]
        mat, kind = reg[0], reg[1]
        # raw (u, v) per vertex, metres (or 0..1 for a rect)
        if uvf is not None:
            raw = [uvf(p) for p in q]
        elif kind == 'rect' and st is not None and all(s is not None for s in qst):
            raw = qst
        else:
            if abs(nh[1]) > 0.7:
                raw = [(p[0], -p[2] * (1 if nh[1] > 0 else -1)) for p in q]
            else:
                t = norm((nh[2], 0.0, -nh[0]))
                raw = [(dot(p, t), p[1]) for p in q]
            if kind == 'rect':
                us, vs = [r[0] for r in raw], [r[1] for r in raw]
                du, dv = max(us) - min(us) or 1, max(vs) - min(vs) or 1
                raw = [((r[0] - min(us)) / du, (r[1] - min(vs)) / dv) for r in raw]
        raw = [(r[0], r[1] + voff) for r in raw]
        if kind == 'strip' and uvf is None and surf in A.FLATV:
            # featureless dark stone and metal: one row of the strip, never cut;
            # the shape of the dark comes from the vertex tint
            T0 = reg[3] / reg[4]
            raw = [(r[0], T0 * 0.5) for r in raw]
        elif kind == 'strip' and uvf is None and (surf in A.ROTATE or surf in A.WALLS):
            # a thin part: its long side along u (which wraps), so it is not cut
            # at every tile line of a short strip. Wall ashlar turns only on a
            # narrow face (a pier's side, a corner wedge), where vertical
            # courses on a hand's breadth of stone are not seen.
            T0 = reg[3] / reg[4]
            us_, vs_ = [r[0] for r in raw], [r[1] for r in raw]
            du_, dv_ = max(us_) - min(us_), max(vs_) - min(vs_)
            if dv_ > T0 - 1e-6 and du_ < dv_ and (surf in A.ROTATE or du_ <= 1.3):
                raw = [(r[1], r[0]) for r in raw]
        # triangulate in the plane -- or, for a convex polygon, keep it whole: it is
        # cut at the strip's tile lines as one piece and fanned, 2 triangles a band
        # instead of the 4 a triangle-by-triangle cut makes (production change)
        ax = max(range(3), key=lambda i: abs(nn[i]))
        a, b = [(1, 2), (2, 0), (0, 1)][ax]
        p2 = [(p[a], p[b]) for p in q]
        out = self.tris.setdefault(mat, [])
        if _convex(p2):
            groups = [list(range(len(q)))]
        else:
            groups = [list(t) for t in earclip(p2)]
        for idx in groups:
            P = [q[i] for i in idx]
            R = [raw[i] for i in idx]
            if len(P) == 3:
                tn = cross(sub(P[1], P[0]), sub(P[2], P[0]))
                if length(tn) < 1e-12:
                    continue
                if dot(tn, nn) < 0:
                    P[1], P[2] = P[2], P[1]
                    R[1], R[2] = R[2], R[1]
            pieces = [[P[m] + R[m] for m in range(len(P))]]
            if kind == 'strip':
                T = reg[3] / reg[4]
                vmin, vmax = min(r[1] for r in R), max(r[1] for r in R)
                k0 = math.floor(vmin / T + 1e-9)
                lines = []
                kk = k0 + 1
                while kk * T < vmax - 1e-9:
                    lines.append(kk * T)
                    kk += 1
                rest = pieces[0]
                pieces = []
                for L in lines:
                    lo, hi = split_poly(rest, L)
                    if len(lo) >= 3:
                        pieces.append(lo)
                    rest = hi
                if len(rest) >= 3:
                    pieces.append(rest)
            for pc in pieces:
                uv = self._uv(reg, pc)
                for m in range(1, len(pc) - 1):
                    tri = (pc[0][:3], pc[m][:3], pc[m + 1][:3])
                    tn = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))
                    if length(tn) < 1e-12:
                        continue
                    uvt = (uv[0], uv[m], uv[m + 1])
                    if dot(tn, nn) < 0:
                        tri, uvt = (tri[0], tri[2], tri[1]), (uvt[0], uvt[2], uvt[1])
                    tt = tuple(tint * tintf(p) for p in tri) if tintf else tint
                    out.append((tri, uvt, tt, smooth))

    def _uv(self, reg, pc):
        """glTF-convention texture coordinates (origin top-left) for one convex
        piece, snapped to 2^-15."""
        return [(round(u * SNAP) / SNAP, round(v * SNAP) / SNAP) for (u, v) in self._uv_raw(reg, pc)]

    def _uv_raw(self, reg, pc):
        mat, kind = reg[0], reg[1]
        W, H = A.SHEETS[mat]['size']
        if kind == 'strip':
            top, h, pxm = reg[2], reg[3], reg[4]
            T = h / pxm
            vm = sum(p[4] for p in pc) / len(pc)
            k = math.floor(vm / T + 1e-9)
            res = []
            for p in pc:
                f = (p[4] - k * T) / T
                f = min(1.0, max(0.0, f))
                res.append((p[3] * pxm / W, (top + (1 - f) * h) / H))
            return res
        if kind == 'rect':
            x0, y0, x1, y1 = reg[2:6]
            return [((x0 + min(1, max(0, p[3])) * (x1 - x0)) / W, (y0 + (1 - min(1, max(0, p[4]))) * (y1 - y0)) / H) for p in pc]
        if kind == 'tile':
            m = reg[2]
            return [(p[3] / m, -p[4] / m) for p in pc]
        return [(0.5, 0.5) for p in pc]

    def merge(self, other, xf=None, tint=1.0):
        """Add another Geo's triangles, optionally moved by xf(p) -> p (a rigid
        motion: winding is kept) and darkened by `tint`."""
        for mat, tris in other.tris.items():
            out = self.tris.setdefault(mat, [])
            for (P, UV, T, sm) in tris:
                P2 = tuple(xf(p) for p in P) if xf else P
                T2 = tuple(t * tint for t in T) if isinstance(T, tuple) else T * tint
                out.append((P2, UV, T2, sm))

    def bounds(self):
        ps = [p for tris in self.tris.values() for (P, *_r) in tris for p in P]
        return ([min(p[i] for p in ps) for i in range(3)], [max(p[i] for p in ps) for i in range(3)])

    def count(self):
        return sum(len(v) for v in self.tris.values())


# ------------------------------------------------------------------ frames and walls
class Frame:
    """p(u, v, d) = O + U*u + V*v + N*d."""
    def __init__(self, O, U, V, N):
        self.O, self.U, self.V, self.N = O, U, V, N

    def p(self, u, v, d=0.0):
        return add(add(add(self.O, mul(self.U, u)), mul(self.V, v)), mul(self.N, d))

    def shift(self, d):
        return Frame(add(self.O, mul(self.N, d)), self.U, self.V, self.N)

    def dirn(self, du, dv, dd=0.0):
        return norm(add(add(mul(self.U, du), mul(self.V, dv)), mul(self.N, dd)))


def strip_frame(A2, B2, y=0.0):
    """Face frame on the line A2->B2 (x, z); u from -L/2 to L/2, N = left of travel."""
    dx, dz = B2[0] - A2[0], B2[1] - A2[1]
    L = math.hypot(dx, dz)
    U = (dx / L, 0.0, dz / L)
    N = (-dz / L, 0.0, dx / L)
    O = ((A2[0] + B2[0]) / 2, y, (A2[1] + B2[1]) / 2)
    return Frame(O, U, (0.0, 1.0, 0.0), N), L


def head_pts(u0, u1, vs, rise, kind='pointed', n=6, off=0.0):
    """Arch head from the left springer to the right, (u, v). `off` widens the
    same arch outward (the archivolt's outer edge)."""
    w, m = u1 - u0, (u0 + u1) / 2
    if kind == 'flat' or rise <= 1e-6:
        return [(u0 - off, vs + rise + off), (u1 + off, vs + rise + off)] if off else [(u0, vs + rise), (u1, vs + rise)]
    if kind == 'pointed' and rise > w / 2 + 1e-6:
        r = (rise * rise + w * w / 4) / w
        cl = u0 + r
        R = r + off
        thA = math.acos(max(-1.0, min(1.0, (m - cl) / R)))
        left = [(cl + R * math.cos(t), vs + R * math.sin(t)) for t in lin(math.pi, thA, n)]
        right = [(2 * m - u, v) for (u, v) in reversed(left[:-1])]
        return left + right
    r = (rise * rise + w * w / 4) / (2 * rise)
    cy = vs + rise - r
    R = r + off
    du = math.sqrt(max(0.0, R * R - (vs - cy) ** 2))
    a0, a1 = math.atan2(vs - cy, -du), math.atan2(vs - cy, du)
    return [(m + R * math.cos(t), cy + R * math.sin(t)) for t in lin(a0, a1, 2 * n)]


def hole(u0, u1, v0, v1, head='flat', rise=0.0, depth=0.3, back='dark', jamb=None, open_bottom=False, n=5, sill=True, decal=False,
         jamb_depth_uv=False):
    # jamb_depth_uv: the reveal's faces take u = the depth into the wall (0 at the
    # face, 1 at the back) and v = the height in the opening, so a rect surface
    # painted as a falloff along u (g_spill: lamplight from the room behind, dark
    # toward the street) lies the same way on every face of the reveal. Without it
    # each face is mapped by its own planar projection, its u running either way
    return dict(u0=u0, u1=u1, v0=v0, v1=v1, head=head, rise=rise if head != 'flat' else 0.0, depth=depth,
                back=back, jamb=jamb, open_bottom=open_bottom, n=n, sill=sill, decal=decal, jamb_depth_uv=jamb_depth_uv)


def slit(u0, u1, v0, v1, back='dark'):
    """A loop or a small blind light: ONE inset-looking quad laid 1.5 cm proud of
    the face (2 triangles), not a cut opening with four reveals (the review's
    'slits a single inset quad')."""
    return hole(u0, u1, v0, v1, depth=0.0, back=back, decal=True)


def _hpts(h):
    return head_pts(h['u0'], h['u1'], h['v1'] - h['rise'], h['rise'], h['head'], h['n'])


def _restrict(pts, a, b):
    """The head polyline between u = a and u = b (left to right)."""
    out = []

    def at(u):
        for (p, q) in zip(pts, pts[1:]):
            if p[0] - 1e-9 <= u <= q[0] + 1e-9 and q[0] > p[0]:
                t = (u - p[0]) / (q[0] - p[0])
                return (u, p[1] + (q[1] - p[1]) * t)
        return min(pts, key=lambda p: abs(p[0] - u))
    out.append(at(a))
    for p in pts:
        if a + 1e-7 < p[0] < b - 1e-7:
            out.append(p)
    out.append(at(b))
    return out


def wall(g, F, u0, u1, v0, v1, holes, surf, tint=1.0, **kw):
    """A rectangular face in frame F with openings, each with its reveal and back.
    Decal holes (slit()) do not cut the face: they are drawn on it."""
    decals = [h for h in holes if h.get('decal')]
    holes = [h for h in holes if not h.get('decal') and h['u0'] < u1 - 1e-6 and h['u1'] > u0 + 1e-6]
    br = sorted(set([u0, u1] + [min(u1, max(u0, h[k])) for h in holes for k in ('u0', 'u1')]))
    for a, b in zip(br, br[1:]):
        if b - a < 1e-6:
            continue
        hs = sorted([h for h in holes if h['u0'] <= a + 1e-6 and h['u1'] >= b - 1e-6], key=lambda h: h['v0'])
        bottom = [(a, v0), (b, v0)]
        for h in hs:
            top = h['v0']
            if top > bottom[0][1] + 1e-6 or top > bottom[-1][1] + 1e-6:
                pg = bottom + [(b, top), (a, top)]
                g.poly([F.p(u, v) for u, v in pg], surf, n=F.N, tint=tint, **kw)
            bottom = _restrict(_hpts(h), a, b)
        pg = bottom + [(b, v1), (a, v1)]
        g.poly([F.p(u, v) for u, v in pg], surf, n=F.N, tint=tint, **kw)
    for h in holes:
        reveal(g, F, h, surf, tint=tint, **kw)
    for h in decals:
        if h['u0'] < u0 - 1e-6 or h['u1'] > u1 + 1e-6:
            continue
        hp = _hpts(h)
        outline = [(h['u0'], h['v0']), (h['u1'], h['v0'])] + list(reversed(hp))
        g.poly([F.p(u, v, 0.015) for u, v in outline], h['back'], n=F.N, tint=tint * 0.8)


def reveal(g, F, h, surf, tint=1.0, **kw):
    hp = _hpts(h)
    vs = h['v1'] - h['rise']
    base = [(h['u0'], h['v0']), (h['u1'], h['v0'])]
    rh = list(reversed(hp))
    outline = base + (rh if vs > h['v0'] + 1e-6 else rh[1:-1])
    d = h['depth']
    js = h['jamb'] or surf
    if d > 1e-6:
        m = len(outline)
        for i in range(m):
            p, q = outline[i], outline[(i + 1) % m]
            if i == 0 and (h['open_bottom'] or not h['sill']):
                continue
            du, dv = q[0] - p[0], q[1] - p[1]
            if abs(du) + abs(dv) < 1e-7:
                continue
            nrm = F.dirn(-dv, du)
            st = None
            if h.get('jamb_depth_uv'):
                vf = lambda v: (v - h['v0']) / max(1e-6, h['v1'] - h['v0'])
                st = [(0.0, vf(p[1])), (0.0, vf(q[1])), (1.0, vf(q[1])), (1.0, vf(p[1]))]
            g.poly([F.p(p[0], p[1]), F.p(q[0], q[1]), F.p(q[0], q[1], -d), F.p(p[0], p[1], -d)], js, n=nrm, tint=tint * (0.9 if dv < 0 else 1.0),
                   **({'st': st} if st else {}), **kw)
    if h['back']:
        w, hh = h['u1'] - h['u0'], h['v1'] - h['v0']
        g.poly([F.p(u, v, -d) for u, v in outline], h['back'], n=F.N,
               st=[((u - h['u0']) / w, (v - h['v0']) / hh) for u, v in outline])


def quad(g, F, u0, u1, v0, v1, surf, d=0.0, **kw):
    g.poly([F.p(u0, v0, d), F.p(u1, v0, d), F.p(u1, v1, d), F.p(u0, v1, d)], surf, n=F.N, **kw)


def box(g, x0, x1, y0, y1, z0, z1, surf, skip=(), top=None, bottom=None, tint=1.0, **kw):
    """An axis-aligned box in module coordinates; skip any of '+x -x +y -y +z -z'."""
    c = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    # index = xi*4 + yi*2 + zi, so a face is the four corners sharing one bit. The
    # mock-up's geo.py had the y and z tuples swapped (its '-y' was the z0 face, its
    # '+y' the z1 face): every skip/top/bottom naming y or z hit the wrong face, and
    # poly() could not catch it (its winding check is a dot with the label's normal,
    # 0 for a mislabelled face). The machicolations were open tubes and the barbican's
    # bridge deck lost its top. Each face here is wound outward (Newell).
    F = {'-x': ((0, 1, 3, 2), (-1, 0, 0)), '+x': ((4, 6, 7, 5), (1, 0, 0)),
         '-y': ((0, 4, 5, 1), (0, -1, 0)), '+y': ((2, 3, 7, 6), (0, 1, 0)),
         '-z': ((0, 2, 6, 4), (0, 0, -1)), '+z': ((1, 5, 7, 3), (0, 0, 1))}
    for k, (ix, n) in F.items():
        if k in skip:
            continue
        s = top if (k == '+y' and top) else bottom if (k == '-y' and bottom) else surf
        g.poly([c[i] for i in ix], s, n=n, tint=tint, **kw)


def beam(g, p0, p1, w, h, surf, up=(0, 1, 0), ends=True, **kw):
    """A rectangular bar from p0 to p1, w wide and h deep."""
    d = norm(sub(p1, p0))
    s = norm(cross(d, up)) if length(cross(d, up)) > 1e-6 else (1, 0, 0)
    t = norm(cross(s, d))
    corners = []
    for p in (p0, p1):
        corners.append([add(add(p, mul(s, a * w / 2)), mul(t, b * h / 2)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    c0, c1 = corners
    for i in range(4):
        j = (i + 1) % 4
        mid = mul(add(add(c0[i], c0[j]), add(c1[i], c1[j])), 0.25)
        cen = mul(add(p0, p1), 0.5)
        g.poly([c0[i], c0[j], c1[j], c1[i]], surf, n=sub(mid, cen), **kw)
    if ends:
        g.poly(c0, surf, n=mul(d, -1), **kw)
        g.poly(c1, surf, n=d, **kw)


def prism(g, fp, y0, y1, surf, top=None, bottom=None, smooth=False, uvf=None, tint=1.0, sides=True):
    """A vertical prism on a convex footprint [(x, z)]; side normals point away from the centroid."""
    cx = sum(p[0] for p in fp) / len(fp)
    cz = sum(p[1] for p in fp) / len(fp)
    n = len(fp)
    if sides:
        for i in range(n):
            a, b = fp[i], fp[(i + 1) % n]
            mid = ((a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz)
            g.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], surf, n=mid, smooth=smooth, uvf=uvf, tint=tint)
    if top:
        g.poly([(p[0], y1, p[1]) for p in fp], top, n=(0, 1, 0), tint=tint)
    if bottom:
        g.poly([(p[0], y0, p[1]) for p in fp], bottom, n=(0, -1, 0), tint=tint)


def frustum(g, fp0, y0, fp1, y1, surf, n_hint_center=None, smooth=False, uvf=None, tint=1.0, **kw):
    """Side faces between two footprints with the same vertex count."""
    cx = sum(p[0] for p in fp0) / len(fp0)
    cz = sum(p[1] for p in fp0) / len(fp0)
    n = len(fp0)
    for i in range(n):
        j = (i + 1) % n
        a0, b0, a1, b1 = fp0[i], fp0[j], fp1[i], fp1[j]
        mid = ((a0[0] + b0[0]) / 2 - cx, 0, (a0[1] + b0[1]) / 2 - cz)
        g.poly([(a0[0], y0, a0[1]), (b0[0], y0, b0[1]), (b1[0], y1, b1[1]), (a1[0], y1, a1[1])], surf, n=mid, smooth=smooth, uvf=uvf, tint=tint, **kw)


def ngon(n, r, cx=0.0, cz=0.0, a0=0.0):
    return [(cx + r * math.sin(a0 + 2 * math.pi * i / n), cz + r * math.cos(a0 + 2 * math.pi * i / n)) for i in range(n)]


# ------------------------------------------------------------------ the arcaded machicolation
# P: y0 foot; bat batter offset at the foot, bh batter top; proj pier projection
# from the core face; ov the OVERSAIL: how far the arch ring, spandrel and
# parapet stand forward of the piers (carried on stepped corbels at each pier
# head, so a shadow line runs under the parapet the whole length of the wall);
# pw half-pier width; pf pier foot (corbelled above y0 when > y0); sp springing;
# rise (None = fit); sc string course; par parapet top (merlon foot); mer merlon
# top (== par: no merlons); pt parapet thickness; walk wall-walk level;
# surf/base faces; gap crenel width.
DEF = dict(y0=0.0, bat=0.0, bh=0.0, proj=1.2, ov=0.35, pw=0.4, pf=None, sp=9.5, rise=None, sc=11.65, par=12.2, mer=13.2,
           pt=0.6, walk=11.4, surf='sea', base='base', gap=0.62, bays=None, slit_merlon=False, ring=True, voff=0.0,
           corbel=True)


def P_(**k):
    p = dict(DEF)
    p.update(k)
    if p['pf'] is None:
        p['pf'] = p['y0']
    return p


def Zof(P, y, above=True):
    """Outer offset of a strip's pier/parapet line at height y, just above (or
    just below) y -- the profile the corner wedges follow."""
    pf, y0, bh, bat, sp = P['pf'], P['y0'], P['bh'], P['bat'], P['sp']
    has_bat = bh > y0 + 1e-9 and bat > 0
    core = bat * (1 - (y - y0) / (bh - y0)) if (has_bat and y < bh) else 0.0
    if y > sp + 1e-9 or (abs(y - sp) <= 1e-9 and above):
        return P['proj'] + P['ov']
    in_pier = pf <= y0 + 1e-9 or y > pf + 1e-9 or (abs(y - pf) <= 1e-9 and above)
    return P['proj'] + core if in_pier else core


def _slot_tint(F, sp, top):
    """The machicolation slot: the core face under each arch head darkens to
    near black toward the crown, where the murder hole opens above."""
    def f(p):
        v = dot(sub(p, F.O), F.V)
        t = min(1.0, max(0.0, (v - (sp - 0.6)) / (top - sp + 0.6)))
        return 0.62 - 0.5 * t
    return f


def arcade_strip(g, A2, B2, P, holes=(), ends=(False, False), tint=1.0):
    F, L = strip_frame(A2, B2)
    nb = P['bays'] or max(1, int(round(L / 4.0)))
    bw = L / nb
    pw, proj, bat, y0, bh, sp, pf = P['pw'], P['proj'], P['bat'], P['y0'], P['bh'], P['sp'], P['pf']
    ov = P['ov']
    zf = proj + ov                                   # the oversailing front: ring, spandrel, parapet
    S, Bs = P['surf'], P['base']
    kw = dict(voff=P['voff'])
    span = bw - 2 * pw
    rise = P['rise'] if P['rise'] else min(0.62 * span, P['sc'] - 0.22 - sp)
    kind = 'pointed' if rise > span / 2 + 1e-6 else 'seg'
    vcore = bh if bh > y0 else y0
    # 1. the core face, with its openings, over the whole strip; the batter under it
    wall(g, F, -L / 2, L / 2, vcore, sp, list(holes), S, tint=tint, **kw)
    if bh > y0 and bat > 0:
        g.poly([F.p(-L / 2, y0, bat), F.p(L / 2, y0, bat), F.p(L / 2, bh, 0), F.p(-L / 2, bh, 0)], Bs, n=F.dirn(0, bat, bh - y0), tint=tint, **kw)
    arches = []
    for i in range(nb):
        a0 = -L / 2 + i * bw + pw
        a1 = a0 + span
        hp = head_pts(a0, a1, sp, rise, kind, 3)
        # the slot: the core face inside the arch, dark toward the crown
        g.poly([F.p(u, v) for u, v in hp], 'dark', n=F.N, tint=tint, tintf=_slot_tint(F, sp, sp + rise))
        arches.append(hole(a0, a1, sp, sp + rise, kind, rise, depth=zf, back=None, jamb='dark', open_bottom=True, n=3))
        # archivolt: ONE dressed ring, 3 cm proud of the spandrel, no returns
        if P['ring']:
            hi = hp
            ho = head_pts(a0, a1, sp, rise, kind, 3, off=0.26)
            for k in range(len(hi) - 1):
                g.poly([F.p(*hi[k], zf + 0.03), F.p(*hi[k + 1], zf + 0.03), F.p(*ho[k + 1], zf + 0.03), F.p(*ho[k], zf + 0.03)], 'trim', n=F.N, tint=tint)
    # 2. piers: a half pier at each end, a full one between bays; stepped corbels
    # at each pier head carry the oversail
    cb = 0.9 if P['corbel'] and ov > 0.05 else 0.0
    for i in range(nb + 1):
        pa = -L / 2 + i * bw - (pw if i > 0 else 0)
        pb = -L / 2 + i * bw + (pw if i < nb else 0)
        if pf > y0 + 1e-6:
            # corbelled: the pier hangs from two stepped corbels
            g.poly([F.p(pa, pf, proj), F.p(pb, pf, proj), F.p(pb, sp - cb, proj), F.p(pa, sp - cb, proj)], S, n=F.N, tint=tint, **kw)
            g.poly([F.p(pa, pf, 0), F.p(pb, pf, 0), F.p(pb, pf, proj), F.p(pa, pf, proj)], 'dark', n=(0, -1, 0), tint=tint)
            for (ya, yb, zz) in ((pf - 0.45, pf, proj * 0.62), (pf - 0.85, pf - 0.45, proj * 0.3)):
                g.poly([F.p(pa, ya, zz), F.p(pb, ya, zz), F.p(pb, yb, zz), F.p(pa, yb, zz)], 'trim', n=F.N, tint=tint)
                g.poly([F.p(pa, ya, 0), F.p(pb, ya, 0), F.p(pb, ya, zz), F.p(pa, ya, zz)], 'trim', n=(0, -1, 0), tint=tint * 0.8)
            sides = [(0, pf), (proj, pf), (proj, sp), (0, sp)]
        else:
            if bh > y0 and bat > 0:
                g.poly([F.p(pa, y0, proj + bat), F.p(pb, y0, proj + bat), F.p(pb, bh, proj), F.p(pa, bh, proj)], Bs, n=F.dirn(0, bat, bh - y0), tint=tint, **kw)
                g.poly([F.p(pa, bh, proj), F.p(pb, bh, proj), F.p(pb, sp - cb, proj), F.p(pa, sp - cb, proj)], S, n=F.N, tint=tint, **kw)
                sides = [(bat, y0), (proj + bat, y0), (proj, bh), (proj, sp), (0, sp), (0, bh)]
            else:
                g.poly([F.p(pa, y0, proj), F.p(pb, y0, proj), F.p(pb, sp - cb, proj), F.p(pa, sp - cb, proj)], S, n=F.N, tint=tint, **kw)
                sides = [(0, y0), (proj, y0), (proj, sp), (0, sp)]
        if i > 0:      # the side facing back into bay i-1 (toward -u)
            g.poly([F.p(pa, y, z) for z, y in sides], S, n=mul(F.U, -1), tint=tint * 0.92, **kw)
        if i < nb:     # the side facing bay i (+u)
            g.poly([F.p(pb, y, z) for z, y in sides], S, n=F.U, tint=tint * 0.92, **kw)
        if cb:
            # one corbel under each pier head: a sloped bracket carrying the oversail
            ya = sp - cb
            g.poly([F.p(pa, ya, proj), F.p(pb, ya, proj), F.p(pb, sp, zf), F.p(pa, sp, zf)], 'trim', n=F.dirn(0, -ov, cb), tint=tint * 0.9)
            for (uu, sgn) in ((pa, -1), (pb, 1)):
                if (sgn < 0 and i == 0 and not ends[0]) or (sgn > 0 and i == nb and not ends[1]):
                    continue
                g.poly([F.p(uu, ya, proj), F.p(uu, sp, zf), F.p(uu, sp, proj)], 'trim', n=mul(F.U, sgn), tint=tint * 0.8)
    # 3. spandrel and parapet breast on the oversail, the arches cut out of it;
    # its underside between the arches' feet is the corbels' top
    wall(g, F.shift(zf), -L / 2, L / 2, sp, P['par'], arches, S, tint=tint, **kw)
    # 4. string course over the arches
    sc = P['sc']
    for (pts, n) in (([(-L / 2, sc - 0.11, zf + 0.14), (L / 2, sc - 0.11, zf + 0.14), (L / 2, sc + 0.11, zf + 0.14), (-L / 2, sc + 0.11, zf + 0.14)], F.N),
                     ([(-L / 2, sc + 0.11, zf), (-L / 2, sc + 0.11, zf + 0.14), (L / 2, sc + 0.11, zf + 0.14), (L / 2, sc + 0.11, zf)], (0, 1, 0)),
                     ([(-L / 2, sc - 0.11, zf), (L / 2, sc - 0.11, zf), (L / 2, sc - 0.11, zf + 0.14), (-L / 2, sc - 0.11, zf + 0.14)], (0, -1, 0))):
        g.poly([F.p(*p) for p in pts], 'trim', n=n, tint=tint)
    # 5. parapet back (the wall-walk side)
    zb = zf - P['pt']
    if P['walk'] < P['par'] - 1e-6:
        g.poly([F.p(-L / 2, P['walk'], zb), F.p(L / 2, P['walk'], zb), F.p(L / 2, P['par'], zb), F.p(-L / 2, P['par'], zb)], 'ash', n=mul(F.N, -1), tint=tint * 0.95)
    # 6. merlons and crenels
    crenels(g, F, -L / 2, L / 2, P['par'], P['mer'], zb, zf, P['gap'], ends, P['slit_merlon'], tint)
    return F, L


def crenels(g, F, u0, u1, par, mer, zb, zf, gap, ends=(False, False), slit_=True, tint=1.0):
    L = u1 - u0
    # a thick (artillery) parapet's tops are ashlar, not a band of dressed trim
    cap = 'ash' if abs(zf - zb) > 1.2 else 'trim'

    if mer <= par + 1e-6:
        g.poly([F.p(u0, par, zb), F.p(u0, par, zf), F.p(u1, par, zf), F.p(u1, par, zb)], cap, n=(0, 1, 0), tint=tint)
        return
    ng = max(1, int(round(L / 2.0)))
    cs = [u0 + (j + 0.5) * L / ng for j in range(ng)]
    gaps = [(c - gap / 2, c + gap / 2) for c in cs]
    edges = [u0] + [x for gp in gaps for x in gp] + [u1]
    for (a, b) in gaps:
        g.poly([F.p(a, par, zb), F.p(a, par, zf), F.p(b, par, zf), F.p(b, par, zb)], cap, n=(0, 1, 0), tint=tint)
    for k in range(0, len(edges), 2):
        a, b = edges[k], edges[k + 1]
        if b - a < 1e-6:
            continue
        Fm = F.shift(zf)
        hs = [slit((a + b) / 2 - 0.07, (a + b) / 2 + 0.07, par + 0.2, mer - 0.25)] if (slit_ and b - a > 1.0) else []
        wall(g, Fm, a, b, par, mer, hs, 'sea' if zf > 0 else 'ash', tint=tint)
        g.poly([F.p(a, mer, zb), F.p(b, mer, zb), F.p(b, par, zb), F.p(a, par, zb)], 'ash', n=mul(F.N, -1), tint=tint * 0.95)
        g.poly([F.p(a, mer, zb), F.p(a, mer, zf), F.p(b, mer, zf), F.p(b, mer, zb)], cap, n=(0, 1, 0), tint=tint)
        for (uu, sgn, isend) in ((a, -1, k == 0), (b, 1, k == len(edges) - 2)):
            if isend and not ends[0 if sgn < 0 else 1]:
                continue
            g.poly([F.p(uu, par, zb), F.p(uu, par, zf), F.p(uu, mer, zf), F.p(uu, mer, zb)], 'sea' if zf > 0 else 'ash', n=mul(F.U, sgn), tint=tint * 0.93)


def wedge(g, C, n1, P1, n2, P2, tint=1.0):
    """Close the corner between two strips that meet at C (2D), outward normals n1, n2."""
    top = max(P1['mer'], P1['par'], P2['mer'], P2['par'])
    ys = sorted(set([min(P1['y0'], P2['y0']), P1['bh'], P2['bh'], P1['pf'], P2['pf'], P1['sp'], P2['sp'], top]))
    ys = [y for y in ys if min(P1['y0'], P2['y0']) - 1e-9 <= y <= top + 1e-9]
    pt = lambda n, z, y: (C[0] + n[0] * z, y, C[1] + n[1] * z)
    bis = norm((n1[0] + n2[0], 0, n1[1] + n2[1]))
    for ya, yb in zip(ys, ys[1:]):
        if yb - ya < 1e-6:
            continue
        za1, za2 = Zof(P1, ya, True), Zof(P2, ya, True)
        zb1, zb2 = Zof(P1, yb, False), Zof(P2, yb, False)
        surf = P1['base'] if yb <= max(P1['bh'], P2['bh']) + 1e-6 and max(P1['bat'], P2['bat']) > 0 else P1['surf']
        g.poly([pt(n1, za1, ya), pt(n2, za2, ya), pt(n2, zb2, yb), pt(n1, zb1, yb)], surf, n=bis, tint=tint, voff=P1['voff'])
    for y in ys[1:-1]:
        lo1, lo2 = Zof(P1, y, False), Zof(P2, y, False)
        hi1, hi2 = Zof(P1, y, True), Zof(P2, y, True)
        if abs(lo1 - hi1) > 1e-6 or abs(lo2 - hi2) > 1e-6:
            g.poly([pt(n1, lo1, y), pt(n2, lo2, y), pt(n2, hi2, y), pt(n1, hi1, y)], 'dark', n=(0, -1, 0), tint=tint)
    zf1, zf2 = P1['proj'] + P1['ov'], P2['proj'] + P2['ov']
    zi1, zi2 = zf1 - P1['pt'], zf2 - P2['pt']
    g.poly([pt(n1, zi1, top), pt(n1, zf1, top), pt(n2, zf2, top), pt(n2, zi2, top)], 'trim', n=(0, 1, 0), tint=tint)
    walk = min(P1['walk'], P2['walk'])
    g.poly([pt(n1, zi1, walk), pt(n2, zi2, walk), pt(n2, zi2, top), pt(n1, zi1, top)], 'ash', n=mul(bis, -1), tint=tint * 0.95)


def orient(poly):
    """Order a convex footprint so that the left of travel is outward."""
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    a, b = poly[0], poly[1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    n = (-dz, dx)
    mx, mz = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz
    return list(poly) if n[0] * mx + n[1] * mz > 0 else list(reversed(poly))


def tower(g, poly, Ps, holes=None, tint=1.0, floor=True):
    """A polygonal tower: an arcade strip on every edge, wedges at every corner,
    the roof floor at the walk. Ps: one P per edge (or one for all)."""
    poly = orient(poly)
    n = len(poly)
    if isinstance(Ps, dict):
        Ps = [Ps] * n
    holes = holes or {}
    norms = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        norms.append((-(b[1] - a[1]) / L, (b[0] - a[0]) / L))
        arcade_strip(g, a, b, Ps[i], holes.get(i, ()), tint=tint)
    fl = []
    for i in range(n):
        j = (i - 1) % n
        C = poly[i]
        wedge(g, C, norms[j], Ps[j], norms[i], Ps[i], tint=tint)
        zj, zi = Ps[j]['proj'] + Ps[j]['ov'] - Ps[j]['pt'], Ps[i]['proj'] + Ps[i]['ov'] - Ps[i]['pt']
        fl.append((C[0] + norms[j][0] * zj, C[1] + norms[j][1] * zj))
        fl.append((C[0] + norms[i][0] * zi, C[1] + norms[i][1] * zi))
    if floor:
        walk = min(P['walk'] for P in Ps)
        g.poly([(x, walk, z) for x, z in fl], 'ash', n=(0, 1, 0), tint=tint * 0.8)
    return poly, norms


# ------------------------------------------------------------------ production additions
def yaw_xf(yaw=0.0, tx=0.0, ty=0.0, tz=0.0):
    """The game's placement of a local point: at yaw Y a local (u, y, v) lands at
    (tx + u cos Y + v sin Y, ty + y, tz - u sin Y + v cos Y) (contract section 2)."""
    c, s = math.cos(yaw), math.sin(yaw)
    return lambda p: (tx + p[0] * c + p[2] * s, ty + p[1], tz - p[0] * s + p[2] * c)


def mirror_x(p):
    """(x, y, z) -> (-x, y, z) is a reflection: only use it through Geo.merge_mirror."""
    return (-p[0], p[1], p[2])


def merge_mirror(g, other):
    """Add `other` reflected in x = 0 (winding reversed so faces stay outward)."""
    for mat, tris in other.tris.items():
        out = g.tris.setdefault(mat, [])
        for (P, UV, T, sm) in tris:
            Q = tuple(mirror_x(p) for p in P)
            T2 = (T[0], T[2], T[1]) if isinstance(T, tuple) else T
            out.append(((Q[0], Q[2], Q[1]), (UV[0], UV[2], UV[1]), T2, sm))


def clip2(poly, axis, val, keep_ge):
    """Sutherland-Hodgman: a convex 2D polygon [(x, z)] clipped to axis >= val (or <=)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        da = (a[axis] - val) if keep_ge else (val - a[axis])
        db = (b[axis] - val) if keep_ge else (val - b[axis])
        if da >= -1e-9:
            out.append(a)
        if (da > 1e-9 and db < -1e-9) or (da < -1e-9 and db > 1e-9):
            t = da / (da - db)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def area2(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2


def minus_rects(poly, rects):
    """A convex polygon [(x, z)] less axis-aligned rects (x0, z0, x1, z1), as convex pieces."""
    pieces = [list(poly)]
    for (x0, z0, x1, z1) in rects:
        new = []
        for pc in pieces:
            L = clip2(pc, 0, x0, False)
            R = clip2(pc, 0, x1, True)
            M = clip2(clip2(pc, 0, x0, True), 0, x1, False)
            B = clip2(M, 1, z0, False) if len(M) >= 3 else []
            T = clip2(M, 1, z1, True) if len(M) >= 3 else []
            new += [q for q in (L, R, B, T) if len(q) >= 3 and area2(q) > 1e-6]
        pieces = new
    return pieces


def deck(g, poly, y, surf='trim', under=None, holes=(), tint=0.8, under_tint=0.6, uvf=None, up=True):
    """A level floor on a convex footprint [(x, z)] at height y, less rect holes;
    its underside too when `under` names a surface (a floor seen from below).
    up=False: a ceiling (facing down) instead."""
    for pc in minus_rects(poly, holes):
        g.poly([(x, y, z) for x, z in pc], surf, n=(0, 1, 0) if up else (0, -1, 0), tint=tint, uvf=uvf)
        if under:
            g.poly([(x, y - 0.02, z) for x, z in pc], under, n=(0, -1, 0), tint=under_tint)


def room(g, pts, y0, y1, surf, holes=None, tint=0.7, skip=()):
    """The inner faces of a room on the polygon pts [(x, z)] from y0 to y1, facing
    inward; holes {edge index: [hole(...)]} with u measured from the edge's middle
    along a->b. A door's reveal belongs to the outer face (its depth = the wall)."""
    holes = holes or {}
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    for i in range(len(pts)):
        if i in skip:
            continue
        a, b = pts[i], pts[(i + 1) % len(pts)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        U = ((b[0] - a[0]) / L, 0.0, (b[1] - a[1]) / L)
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        nin = norm((cx - mid[0], 0.0, cz - mid[1]))
        N = (-U[2], 0.0, U[0])
        if dot(N, nin) < 0:
            N = mul(N, -1)
        F = Frame((mid[0], 0.0, mid[1]), U, (0.0, 1.0, 0.0), N)
        wall(g, F, -L / 2, L / 2, y0, y1, holes.get(i, []), surf, tint=tint)


def flight(g, a, b, half, n, surf='trim', side='ash', strings=(True, True), solid=False, th=0.45, sh=0.22, tint=1.0,
           top_face=True):
    """A straight stone flight from a = (x, y, z) (the foot, on the lower floor) to
    b (the head, on the upper floor): n risers of (yb - ya) / n on n treads of
    run / n; tread k's top at ya + (k + 1) r from k t to (k + 1) t, so the nosing
    line runs y = ya + r + s r / t and the last tread is the upper floor's level
    (the contract's flights: the wall stair's 57 risers on 0.3333 treads to its
    landing). half: the clear half width. strings (left, right of travel): a
    closed string face standing `sh` over the nosing line on that side. solid: the
    sides run down to ya (a stair body on the ground); else a soffit th under the
    nosing line closes it (a flight in a room, seen from below)."""
    xa, ya, za = a
    xb, yb, zb = b
    run = math.hypot(xb - xa, zb - za)
    d = ((xb - xa) / run, 0.0, (zb - za) / run)
    l = (-d[2], 0.0, d[0])                       # left of travel
    r, t = (yb - ya) / n, run / n

    def P(s, y, w):
        return (xa + d[0] * s + l[0] * w, y, za + d[2] * s + l[2] * w)
    for k in range(n):
        s0, s1, yt = k * t, (k + 1) * t, ya + (k + 1) * r
        g.poly([P(s0, yt, -half), P(s1, yt, -half), P(s1, yt, half), P(s0, yt, half)], surf, n=(0, 1, 0), tint=tint)
        g.poly([P(s0, yt - r, -half), P(s0, yt - r, half), P(s0, yt, half), P(s0, yt, -half)], surf, n=mul(d, -1), tint=tint * 0.86)
    ytop = yb + sh
    for (w, on) in ((half, strings[0]), (-half, strings[1])):
        if not on:
            continue
        nn = l if w > 0 else mul(l, -1)
        if solid:
            pg = [(0.0, ya), (run, ya), (run, ytop), (run - t, ytop), (0.0, ya + r + sh)]
        else:
            pg = [(0.0, ya), (run, yb - th), (run, ytop), (run - t, ytop), (0.0, ya + r + sh)]
        g.poly([P(s, y, w) for s, y in pg], side, n=nn, tint=tint * 0.9)
    if not solid:
        g.poly([P(0.0, ya, -half), P(0.0, ya, half), P(run, yb - th, half), P(run, yb - th, -half)], side,
               n=norm((0, -1, 0)), tint=tint * 0.55)
        if top_face:
            g.poly([P(run, yb - th, -half), P(run, yb - th, half), P(run, yb, half), P(run, yb, -half)], 'trim', n=d, tint=tint * 0.8)


def oct_pts(apothem, phase=0.0, n=8, cx=0.0, cz=0.0):
    """A regular n-gon by its apothem, faces centred at angles phase + 2 pi k / n
    measured from +z toward +x (vertices half a step off)."""
    R = apothem / math.cos(math.pi / n)
    return [(cx + R * math.sin(phase + math.pi / n + 2 * math.pi * k / n), cz + R * math.cos(phase + math.pi / n + 2 * math.pi * k / n))
            for k in range(n)]


# ------------------------------------------------------------------ the module registry
# name -> builder returning a Geo. Each caerdun_mod_*.py registers its own; the
# builder imports them all. The contract's catalogue (set, LODs, what each is
# for) is the manifest's; the triangle ceilings live in the test, never here.
MODULES = {}


def module(name):
    def deco(fn):
        assert name not in MODULES, name
        MODULES[name] = fn
        return fn
    return deco


# ---------------------------------------------------------------- the contract's datums
# Copied from tools/data/caerdun_contract.json (`datums`, `shellDatums`),
# 2026-10-06. Where the modules depart from them (on purpose) the contract's
# `asBuilt` block and the manifest's `departures` carry the as-built numbers. The generator never reads the scratch contract; the manifest records
# these and caerdun_modules.test.mjs holds them to its own copy, so the two cannot
# drift apart unnoticed. Local coordinates unless a name says absolute.
DATUMS = {'F': 9.875,
 'apron': 0.95,
 'bastionPlatform': 21.275,
 'bay': 4.0,
 'crenelSillRel': 12.2,
 'crown': 33.975,
 'crownRel': 24.1,
 'deckOverlap': 0.25,
 'ditchFloor': 1.875,
 'endPad': 0.05,
 'flightHalfMin': 1.0,
 'grid': {'cell': 4.666666666666667, 'n': 150, 'origin': -350.0, 'size': 700},
 'headroom': 2.2,
 'houseDepth': 10.0,
 'houseEave': 11.0,
 'merlonTopRel': 13.2,
 'moleDeck': 1.6,
 'paradosTopRel': 12.4,
 'parapetZ': [1.2, 1.85],
 'platEdgeOutboardOfCurtain': 3.0,
 'riserMax': 0.205,
 'risersPerFlightMax': 30,
 'scarpApronDepth': 5.0,
 'scarpFootBelowStrip': 3.0,
 'scarpTopOutboardOfPlat': 4.5,
 'sea': -1.3,
 'stepUp': 0.9,
 'storey': 3.4,
 'strip': 0.5,
 'townFaceZ': {'land': -1.5, 'sea': -1.4},
 'treadMin': 0.3,
 'walk': 21.275,
 'walkClear': 2.2,
 'walkRel': 11.4,
 'walkZ': [-1.0, 1.2]}

SHELL = {'curtain': {'colliders': 'body y -inf..11.4 over the section; parapet box to 13.2; parados box to 12.4 (none on a stair-landing bay)',
             'merlonTop': 13.2,
             'paradosTop': 12.4,
             'paradosZ': [-1.4, -1.0],
             'parapetZ': [1.2, 1.85],
             'townFaceZ': -1.4,
             'walkY': 11.4,
             'walkZ': [-1.0, 1.2]},
 'flightsRule': 'every flight: a ramp on the nosing line with a 0.05 m end pad + a stair body (solid to the ground unless thickness given); decks '
                'that only touch overlap 0.25 m',
 'sg_bastion': {'flights': [{'from': [-6.5, 0.0, 3.0], 'half': 1.0, 'id': 'B1', 'to': [1.0, 4.6875, 3.0]},
                            {'from': [1.0, 4.6875, 5.4], 'half': 1.0, 'id': 'B2', 'to': [-6.5, 9.375, 5.4]},
                            {'from': [6.8, 9.375, 3.0], 'half': 1.0, 'id': 'B3', 'to': [-2.3, 15.075, 3.0]},
                            {'from': [-2.3, 15.075, 7.4], 'half': 1.0, 'id': 'B4a', 'to': [2.25, 17.925, 7.4]},
                            {'from': [2.25, 17.925, 9.6], 'half': 1.0, 'id': 'B4b', 'to': [-2.3, 20.775, 9.6]}],
                'gorgeLevel': {'corridor': {'x': [-9.0, 9.0], 'z': [0.2, 2.0]},
                               'doors': 'gorge face z 0 at x = +-8.0, 1.6 wide, 2.6 high (onto the plateau)',
                               'y': 9.375},
                'landings': [{'x': [1.0, 2.4], 'y': 4.6875, 'z': [2.0, 6.4]},
                             {'x': [-8.6, -6.5], 'y': 9.375, 'z': [0.2, 6.4]},
                             {'x': [6.8, 8.2], 'y': 9.375, 'z': [0.2, 4.0]},
                             {'x': [-3.7, -2.3], 'y': 15.075, 'z': [2.0, 8.4]},
                             {'x': [2.25, 3.65], 'y': 17.925, 'z': [6.4, 10.6]}],
                'lightPost': [1.2, 2.9],
                'lighthouse': [0.0, 9.0],
                'lighthouseRoom': {'ceiling': 24.4,
                                   'centre': [0.0, 9.0],
                                   'door': 'the lighthouse door on its local -z face, centre (0, 3.9), 1.4 wide, OPEN: the stair comes up inside the '
                                           'tower and out of its door',
                                   'hole': 'over B4b x -2.3..1.3, z 8.6..10.6',
                                   'r': 4.1,
                                   'y': 20.775},
                'platform': {'joins': 'curtain walks at local (+-15.5, -1.0)',
                             'shape': 'half disc r 14.4 (local z >= 0) + the gorge strip x -16.5..16.5, z -1.5..0, minus the lighthouse (collider r '
                                      '5.1)',
                             'y': 20.775},
                'postern': 'strip level, facets 3 -> 7, clear 3.0 x 3.6; keeper door on facet 5 at local (0, 0, 16); both reach B1 foot'},
 'sg_chain_tower': {'door': 'local -z face (toward the mole root), 1.3 wide, y 1.6..4.0',
                    'placedYaw': 'south tower: local -z faces east (yaw -pi/2)',
                    'post': [0.0, -3.5],
                    'room': {'ceiling': 5.4, 'r': 5.5, 'y': 1.6}},
 'sg_clock_tower': {'entry': {'from': [0.0, 0.0, 6.6], 'half': 1.2, 'to': [0.0, 1.0, 5.0]},
                    'flights': [{'from': [2.7, 1.0, -2.8], 'id': 'K0', 'to': [2.7, 4.4, 2.8]},
                                {'from': [2.8, 4.4, 2.7], 'id': 'K1', 'to': [-2.8, 7.8, 2.7]},
                                {'from': [-2.7, 7.8, 2.8], 'id': 'K2', 'to': [-2.7, 11.2, -2.8]},
                                {'from': [-2.8, 11.2, -2.7], 'id': 'K3', 'to': [2.8, 14.6, -2.7]},
                                {'from': [2.7, 14.6, -2.8], 'id': 'K4', 'to': [2.7, 18.0, 2.8]}],
                    'floors': [1.0, 4.4, 7.8, 11.2, 14.6, 18.0],
                    'half': 1.0,
                    'holes': 'floor k+1 over flight Kk: 2.5 x 5.6 along its wall',
                    'post': [0.0, 2.6],
                    'postFloor': 4,
                    'room': {'x': [-3.8, 3.8], 'z': [-3.8, 3.8]}},
 'sg_court_hall': {'entry': {'from': [0.0, 0.0, 9.8], 'half': 2.0, 'to': [0.0, 1.0, 8.2]},
                   'flights': [{'from': [-9.5, 1.0, 2.8], 'half': 1.08, 'id': 'C1', 'to': [-9.5, 4.4, -2.8]},
                               {'from': [-9.5, 4.4, 2.8], 'half': 1.08, 'id': 'C2', 'to': [-9.5, 7.8, -2.8]}],
                   'floors': [1.0, 4.4, 7.8],
                   'gallery': {'x': [-10.8, 10.8], 'y': 7.8, 'z': [-6.8, -4.4]},
                   'holes': 'floors 1 and 2 over C1/C2 (x -10.74..-8.26, z -2.8..2.8)',
                   'room': {'x': [-10.8, 10.8], 'z': [-6.8, 6.8]}},
 'sg_crown_gate': {'crownTerrace': {'hole': 'caphouse x -9.6..-7.2, z -7.0..0.0',
                                    'post': [2.5, 1.5],
                                    'x': [-15.0, 15.0],
                                    'y': 24.1,
                                    'z': [-7.0, 7.0]},
                   'flights': [{'from': [-12.6, 0.0, -5.6], 'half': 1.0, 'id': 'F1', 'to': [-12.6, 5.7, 3.1]},
                               {'from': [-8.4, 5.7, 3.1], 'half': 1.0, 'id': 'F2', 'to': [-8.4, 11.4, -5.6]},
                               {'from': [-12.6, 11.4, -5.6], 'half': 1.0, 'id': 'F3', 'to': [-12.6, 17.75, 4.0]},
                               {'from': [-8.4, 17.75, 4.0], 'half': 1.0, 'id': 'F4', 'to': [-8.4, 24.1, -5.6]},
                               {'from': [12.6, 0.0, -5.6], 'half': 1.0, 'id': 'F1s', 'to': [12.6, 5.7, 3.1]},
                               {'from': [8.4, 5.7, 3.1], 'half': 1.0, 'id': 'F2s', 'to': [8.4, 11.4, -5.6]}],
                   'gallery': {'doors': 'x = +-15.0, z -0.55..0.75', 'x': [-15.25, 15.25], 'y': 11.4, 'z': [-1.0, 1.2]},
                   'landings': [{'x': [-13.8, -7.2], 'y': 5.7, 'z': [3.1, 5.8]},
                                {'x': [-13.8, -7.2], 'y': 17.75, 'z': [4.0, 5.8]},
                                {'x': [7.2, 13.8], 'y': 5.7, 'z': [3.1, 5.8]}],
                   'note': 'local x -10.5 is the NORTH tower when placed at yaw pi/2 (world z = cz - lx)',
                   'passage': {'apex': 7.6, 'x': [-2.5, 2.5], 'z': [-7.0, 9.0]},
                   'towerDoors': 'town face z -7.0 at x = +-10.5, 1.3 wide, y 0..2.6',
                   'towerRooms': {'holes': 'over F2/F2s (x -9.4..-7.4 / 7.4..9.4, z -5.6..3.1)',
                                  'x': [[-13.8, -7.2], [7.2, 13.8]],
                                  'y': 11.4,
                                  'z': [-5.8, 5.8]}},
 'sg_ditch': {'depth': 8.0, 'floorHalf': 4.667, 'lips': 9.333, 'proud': 0.15},
 'sg_scarp': {'apron': {'depth': 5.0, 'y': 0.05}, 'batter': 0.25, 'foot': 'strip - 3.0'},
 'sg_seagate': {'chamber': {'x': [-6.65, 6.65], 'y': 11.4, 'z': [-1.0, 1.2]},
                'doors': 'flank faces x = +-6.4, z -0.55..0.75, y 11.4..13.8',
                'passage': {'clear': 6.0, 'x': [-2.0, 2.0], 'z': [-6.1, 6.1]}},
 'sg_stair_bay': {'flight': 'continuous over the 6 bays: harbour.wallStair.flight'},
 'sg_tower': {'doors': [{'face': 'x=-5.0', 'y': [11.4, 13.8], 'z': [-0.55, 0.75]}, {'face': 'x=+5.0', 'y': [11.4, 13.8], 'z': [-0.55, 0.75]}],
              'room': {'ceiling': 15.2, 'x': [-3.8, 3.8], 'y': 11.4, 'z': [-2.8, 3.8]},
              'walkDeck': {'x': [-5.25, 5.25], 'z': [-1.0, 1.2]}},
 'sg_tower_corner': {'doors': 'centres (+-4.6, -4.6) on the back-diagonal faces, 1.3 wide, y 11.4..13.8',
                     'room': {'apothem': 5.3, 'ceiling': 15.2, 'y': 11.4}},
 'sg_tower_tall': 'as sg_tower',
 'sg_wall_stair': {'flight': {'from': [0.0, 0.0, 1.1], 'half': 1.0, 'to': [19.0, 11.4, 1.1]},
                   'landing': {'x': [19.0, 21.65], 'y': 11.4, 'z': [0.0, 2.4]}}}
