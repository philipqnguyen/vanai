"""Geometry library for the Capital's Colonnade modules (Blender, headless).

Imported by build_capital_modules.py; ported from the approved Colonnade mock-up's
library and extended for the atlases (capital_atlas.py) and LODs.

Conventions:
  * metres; GAME coordinates: x along the facade, y up, +z outward (toward the
    street); stored in Blender as (x, -z, y). Blender's glTF exporter maps that
    back, so a GLB's coordinates ARE game coordinates.
  * every part is made in its own LOCAL frame, UV'd there, then moved by an
    optional 4x4 game-space matrix M (and the current `OFFSET`, which is how one
    storey's element is stacked into a merged bay column).
  * a SURFACE names what a face is (Ashlar, Door, Glass...); it resolves to one of
    eight MATERIALS (CL_Stone, CL_Fabric, CL_Glass, CL_Roof, CL_Copper, CL_Gilt,
    CL_Glow, CL_Water) plus a place on that material's sheet:
      strip  -- a full-width tiling strip; box/lathe UVs in 2 m tiles. Faces are
                CUT where their v crosses a whole tile (`split_v`) so every piece
                samples one copy of the strip (the gutters make the cut seamless).
      rect   -- a panel: 0..1 across the part (or explicit uvs) into a rectangle.
      swatch -- every corner at the centre of a flat-colour square.
      tile   -- the material's own tiling sheet (roof, copper): no atlas, no cuts.
      flat   -- no texture at all (gilt, glow, water).
  * face orientation is made right per part, never by a global recalc that
    guesses: closed manifolds -> bmesh recalc; open sheets -> an explicit facing;
    lathes -> the profile's own outward normal.
  * LOD: `LOD` (0, 1) is read by the primitives -- bevels only at LOD0, fewer
    segments at LOD1 -- and by the element builders, which drop mouldings that
    the LOD1 texture strips paint instead.
"""
import bpy, bmesh, math, sys
from pathlib import Path
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capital_atlas as A

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # game -> blender
CI = C.inverted()
COL = None
CATALOG = {}
LOD = 0
# a vertex-tint multiplier over everything made while it is set (a part in shade: the
# keep's vestibule, M1) -- 1 everywhere else
TINT = 1.0
OFFSET = Matrix.Identity(4)

# ---------------------------------------------------------------- materials and surfaces
# name: (base colour for the GLB's own factor, roughness, metallic). The runtime
# binds the sheets by material name (manifest.json "materials"); the factors are
# only what a plain glTF viewer shows.
MATERIALS = {
    'CL_Stone':  ((1, 1, 1), .9, 0.0),
    'CL_Fabric': ((1, 1, 1), .7, 0.0),
    'CL_Glass':  ((1, 1, 1), .12, 0.0),
    'CL_Roof':   ((1, 1, 1), .85, 0.0),
    'CL_Copper': ((1, 1, 1), .5, .25),
    'CL_Gilt':   ((.83, .62, .26), .32, .9),
    'CL_Glow':   ((.95, .82, .55), .4, 0.0),
    'CL_Water':  ((.17, .37, .38), .06, .1),
}
_MAT = {}


def mat(name):
    m = _MAT.get(name)
    if m is None:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes['Principled BSDF']
        c, r, mt = MATERIALS[name]
        p.inputs['Base Color'].default_value = (*c, 1); p.inputs['Roughness'].default_value = r
        p.inputs['Metallic'].default_value = mt
        # single-sided: Blender's default (culling off) exports doubleSided, and
        # Babylon then draws and shadows the back of every face in the city.
        # Winding is made right per part (above), and every surface that is
        # seen from both sides -- awning, banner, cloth drops, leaves, LOD1
        # baluster cards -- carries its own back face, so culling is safe.
        m.use_backface_culling = True
        _MAT[name] = m
    return m


S = A.STONE; F = A.FABRIC; G = A.GLASS
# surface: (material, kind, atlas, region, uv mode, vertex tint)
SURF = {
    'Ashlar':    ('CL_Stone', 'strip', S, 'ashlar', 'box', 1.0),
    'Rustic':    ('CL_Stone', 'strip', S, 'rustic', 'box', 1.0),
    'Trim':      ('CL_Stone', 'strip', S, 'trim', 'box', 1.0),
    'Plaster':   ('CL_Stone', 'strip', S, 'plaster', 'box', 1.0),
    'TympHall':  ('CL_Stone', 'rect', S, 'tymp_hall', 'panel', 1.0),
    'TympHouse': ('CL_Stone', 'rect', S, 'tymp_house', 'panel', 1.0),
    'Inscr':     ('CL_Stone', 'rect', S, 'inscr', 'panel_mirror', 1.0),
    'EntStrip':  ('CL_Stone', 'rect', S, 'ent_strip', 'explicit', 1.0),
    'BalStrip':  ('CL_Stone', 'rect', S, 'bal_strip', 'explicit', 1.0),
    'Lead':      ('CL_Stone', 'swatch', S, 'lead', 'swatch', 1.0),
    'Dark':      ('CL_Stone', 'swatch', S, 'dark', 'swatch', 1.0),
    'DarkR':     ('CL_Stone', 'swatch', S, 'dark_r', 'swatch', 1.0),   # lit in the returned city's nights only
    'Shade':     ('CL_Stone', 'swatch', S, 'shade', 'swatch', 1.0),    # never lit
    'Soil':      ('CL_Stone', 'swatch', S, 'soil', 'swatch', 1.0),
    'Wood':      ('CL_Fabric', 'strip', F, 'wood', 'box', 1.0),
    'Door':      ('CL_Fabric', 'rect', F, 'door', 'panel', 1.0),
    'Shutter':   ('CL_Fabric', 'rect', F, 'shutter', 'panel', 1.0),
    'Boards':    ('CL_Fabric', 'rect', F, 'boards', 'panel', 1.0),
    'Awning':    ('CL_Fabric', 'rect', F, 'awning', 'panel', 1.0),
    'Cloth':     ('CL_Fabric', 'rect', F, 'cloth', 'panel', 1.0),
    'Banner':    ('CL_Fabric', 'rect', F, 'banner', 'panel', 1.0),
    'BannerCaer':  ('CL_Fabric', 'rect', F, 'banner_caerdun', 'panel', 1.0),
    'BannerHeart': ('CL_Fabric', 'rect', F, 'banner_heartwood', 'panel', 1.0),
    'BannerMoon':  ('CL_Fabric', 'rect', F, 'banner_moonmere', 'panel', 1.0),
    'Bronze':    ('CL_Fabric', 'swatch', F, 'bronze', 'swatch', 1.0),
    'Ceramic':   ('CL_Fabric', 'swatch', F, 'ceramic', 'swatch', 1.0),
    'Candle':    ('CL_Fabric', 'swatch', F, 'candle', 'swatch', 1.0),
    'Canvas':    ('CL_Fabric', 'swatch', F, 'canvas', 'swatch', 1.0),
    'Slate':     ('CL_Fabric', 'swatch', F, 'slate', 'swatch', 1.0),
    'Leather':   ('CL_Fabric', 'swatch', F, 'leather', 'swatch', 1.0),
    # M1: the morning stalls' goods -- apples and greens heaped in their baskets
    'Fruit':     ('CL_Fabric', 'swatch', F, 'fruit', 'swatch', 1.0),
    'Greens':    ('CL_Fabric', 'swatch', F, 'greens', 'swatch', 1.0),
    'Shelves':   ('CL_Fabric', 'rect', F, 'shelves', 'panel', 1.0),
    # L2: the courtyard gardens' clipped box and a parterre's planting
    'Hedge':     ('CL_Fabric', 'rect', F, 'hedge', 'panel', 1.0),
    'Flowers':   ('CL_Fabric', 'rect', F, 'flowers', 'panel', 1.0),
    # the gate's inscription (on the fabric sheet: see capital_atlas), mirrored like the Hall's
    'InscrGate':   ('CL_Fabric', 'rect', F, 'inscr_gate', 'panel_mirror', 1.0),
    'Glass':     ('CL_Glass', 'rect', G, 'tall', 'panel', 1.0),
    'GlassSq':   ('CL_Glass', 'rect', G, 'sq', 'panel', 1.0),
    'GlassShop': ('CL_Glass', 'rect', G, 'shop', 'panel', 1.0),
    'Fan':       ('CL_Glass', 'rect', G, 'fan', 'panel', 1.0),
    'GlassDrum': ('CL_Glass', 'rect', G, 'tall', 'panel', 1.0),
    'Honey':     ('CL_Roof', 'tile', None, None, 'roof', 1.0),
    'Ridge':     ('CL_Roof', 'tile', None, None, 'box', .78),    # the same tile, one firing darker
    'RoofStone': ('CL_Roof', 'tile', None, None, 'box', .7),     # chimney pots
    'Copper':    ('CL_Copper', 'tile', None, None, 'box', 1.0),
    'CopperRib': ('CL_Copper', 'tile', None, None, 'box', 1.0),
    'Gilt':      ('CL_Gilt', 'flat', None, None, 'box', 1.0),
    'Glow':      ('CL_Glow', 'flat', None, None, 'box', 1.0),
    'Water':     ('CL_Water', 'flat', None, None, 'box', 1.0),
}
for k in A.STONE['elev']['slots']:
    SURF['Elev_' + k] = ('CL_Stone', 'rect', S, k, 'explicit', 1.0)


def start(name):
    global COL
    COL = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(COL)


class at:
    """`with at(y=4.4):` stacks an element into the current module at that offset."""
    def __init__(self, x=0.0, y=0.0, z=0.0, M=None):
        self.M = M if M is not None else Matrix.Translation(Vector((x, y, z)))
    def __enter__(self):
        global OFFSET
        self.prev = OFFSET; OFFSET = OFFSET @ self.M
    def __exit__(self, *a):
        global OFFSET
        OFFSET = self.prev


# ---------------------------------------------------------------- core mesh builder
def _uv_box(p, n):
    ax = max(range(3), key=lambda i: abs(n[i]))
    if ax == 0: return (p[2] * (1 if n[0] > 0 else -1) / 2, p[1] / 2)
    if ax == 1: return (p[0] / 2, p[2] / 2)
    return (p[0] * (1 if n[2] > 0 else -1) / 2, p[1] / 2)


def _uv_roof(p, n):
    n = Vector(n)
    if abs(n.y) > .985: return (p[0] / 2, p[2] / 2)
    h = Vector((n.x, 0, n.z)).normalized()
    t = Vector((-h.z, 0, h.x)); s = n.cross(t).normalized()
    if s.y < 0: s = -s
    P = Vector(p)
    return (P.dot(t) / 2, P.dot(s) / 2)


def _g(co): return (co.x, co.z, -co.y)          # blender -> game
def _gn(n): return (n.x, n.z, -n.y)


def split_v(bm):
    """Cut box-UV'd faces where their v crosses a whole 2 m tile: faces whose box
    projection is vertical (v = y/2) at y = 2k, horizontal ones (v = z/2) at z = 2k.
    Coplanar cuts: the arris bevel and the sharp-edge split leave them alone."""
    def group(f):
        n = _gn(f.normal); return 'H' if max(range(3), key=lambda i: abs(n[i])) == 1 else 'V'
    for gname, axis in (('V', 1), ('H', 2)):
        vals = [_g(v.co)[axis] for v in bm.verts]
        if not vals: return
        lo, hi = min(vals), max(vals)
        for k in range(math.floor(lo / 2) + 1, math.ceil(hi / 2)):
            c = 2.0 * k
            faces = []
            for f in bm.faces:
                if group(f) != gname: continue
                ys = [_g(v.co)[axis] for v in f.verts]
                if min(ys) < c - 1e-4 and max(ys) > c + 1e-4: faces.append(f)
            if not faces: continue
            edges = {e for f in faces for e in f.edges}; verts = {v for f in faces for v in f.verts}
            co = Vector((0, 0, c)) if axis == 1 else Vector((0, -c, 0))
            no = Vector((0, 0, 1)) if axis == 1 else Vector((0, 1, 0))
            bmesh.ops.bisect_plane(bm, geom=list(faces) + list(edges) + list(verts), plane_co=co, plane_no=no, dist=1e-5)
            bm.faces.ensure_lookup_table()


def mesh(name, vs, faces, surf, smooth=False, M=None, uvs=None, facing=None, solid=False,
         radial=None, bevel=0.0, normals2=None, tint=1.0):
    """vs, faces in LOCAL game coords. uvs: per-face list of per-corner (u, v) --
    tile units for a strip/tile surface (lathes), 0..1 rect-local for 'explicit'.
    facing: flip faces whose normal points away from it (open sheets).
    radial: (cx, cz, sign) -> faces point away from (+1) / toward the vertical axis.
    normals2: per-face expected normal (lathe). solid: closed manifold -> recalc."""
    material, kind, atlas, region, mode, stint = SURF[surf]
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, -z, y) for x, y, z in vs], [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    if solid:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:
        for i, f in enumerate(bm.faces):
            f.normal_update(); ng = Vector(_gn(f.normal))
            want = None
            if normals2 is not None: want = normals2[i]
            elif facing is not None: want = Vector(facing)
            elif radial is not None:
                c = f.calc_center_median(); cg = Vector(_g(c))
                want = Vector((cg.x - radial[0], 0, cg.z - radial[1])) * radial[2]
            if want is not None and ng.dot(Vector(want)) < 0: f.normal_flip()
    # remember each face's source corner order for given uvs (a flip reverses it)
    if uvs is not None:
        key = bm.faces.layers.int.new('src')
        for i, f in enumerate(bm.faces): f[key] = i
    elif kind == 'strip' and mode == 'box':
        split_v(bm)
    bm.to_mesh(me)
    src = None
    if uvs is not None:
        src = [f[key] for f in bm.faces]
    bm.free()
    uvl = me.uv_layers.new(name='UVMap')
    vg = [_g(v.co) for v in me.vertices]
    for pi, poly in enumerate(me.polygons):
        ng = _gn(poly.normal)
        lids = list(poly.loop_indices)
        if kind == 'swatch':
            raw = [(.5, .5)] * len(lids)
        elif uvs is not None:
            orig = list(faces[src[pi]]); per = uvs[src[pi]]
            raw = [per[orig.index(me.loops[li].vertex_index)] for li in lids]
        elif mode in ('panel', 'panel_mirror'):
            raw = None
        elif mode == 'roof':
            raw = [_uv_roof(vg[me.loops[li].vertex_index], ng) for li in lids]
        else:
            raw = [_uv_box(vg[me.loops[li].vertex_index], ng) for li in lids]
        if raw is None: continue
        if kind == 'strip':
            vc = sum(r[1] for r in raw) / len(raw); k = math.floor(vc + 1e-6)
            for li, (u, v) in zip(lids, raw):
                uvl.data[li].uv = A.strip_uv(atlas, region, u, min(1.0, max(0.0, v - k)))
        elif kind in ('rect', 'swatch'):
            for li, (u, v) in zip(lids, raw):
                uvl.data[li].uv = A.rect_uv(atlas, region, min(1.0, max(0.0, u)), min(1.0, max(0.0, v)))
        else:
            for li, uv in zip(lids, raw): uvl.data[li].uv = uv
    if mode in ('panel', 'panel_mirror'):
        # 0..1 across the part, on the plane of its dominant face direction
        areas = Vector((0, 0, 0))
        for poly in me.polygons:
            n = _gn(poly.normal); areas += Vector((abs(n[0]), abs(n[1]), abs(n[2]))) * poly.area
        ax = max(range(3), key=lambda i: areas[i])
        a, b = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[ax]
        lo = [min(v[i] for v in vg) for i in range(3)]; hi = [max(v[i] for v in vg) for i in range(3)]
        for poly in me.polygons:
            for li in poly.loop_indices:
                g = vg[me.loops[li].vertex_index]
                uu = (g[a] - lo[a]) / max(1e-6, hi[a] - lo[a]); vv = (g[b] - lo[b]) / max(1e-6, hi[b] - lo[b])
                if mode == 'panel_mirror': uu = 1 - uu   # text reads right in Babylon's left-handed world
                uvl.data[li].uv = A.rect_uv(atlas, region, uu, vv)
    for p in me.polygons: p.use_smooth = smooth
    Mt = OFFSET @ M if M is not None else OFFSET
    me.transform(C @ Mt @ CI)
    t = stint * tint * TINT
    ca = me.color_attributes.new('Tint', 'BYTE_COLOR', 'CORNER')
    for d in ca.data: d.color = (t, t, t, 1)
    o = bpy.data.objects.new(name, me); COL.objects.link(o); me.materials.append(mat(material))
    if bevel and LOD == 0:
        mod = o.modifiers.new('arris', 'BEVEL'); mod.width = bevel; mod.segments = 1; mod.limit_method = 'ANGLE'
    return o


# ---------------------------------------------------------------- primitives
def box(name, x0, x1, y0, y1, z0, z1, surf, bevel=0.0, M=None, tint=1.0):
    vs = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh(name, vs, fs, surf, M=M, solid=True, bevel=bevel, tint=tint)


def quad(name, pts, surf, facing, M=None, uvs=None):
    return mesh(name, pts, [tuple(range(len(pts)))], surf, M=M, facing=facing, uvs=[uvs] if uvs else None)


def card(name, x0, x1, y0, y1, z, surf, u0=0.0, u1=1.0, v0=0.0, v1=1.0, back=False, M=None):
    """A facade-plane quad facing +z (and optionally its back) with explicit rect UVs:
    how the LOD strips and elevations are laid on."""
    pts = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    uv = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    quad(name, pts, surf, (0, 0, 1), M=M, uvs=uv)
    if back:
        quad(name + ' back', pts[::-1], surf, (0, 0, -1), M=M, uvs=uv[::-1])


def prism(name, poly, z0, z1, surf, M=None, bevel=0.0, axis='z'):
    """Extrude a 2D polygon. axis 'z': poly in (x, y) along z; 'x': poly in (z, y)
    along x; 'y': poly in (x, z) along y."""
    n = len(poly); vs = []
    for d in (z0, z1):
        for a, b in poly:
            vs.append((a, b, d) if axis == 'z' else (d, b, a) if axis == 'x' else (a, d, b))
    fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n; fs.append((i, j, n + j, n + i))
    return mesh(name, vs, fs, surf, M=M, solid=True, bevel=bevel)


def lathe(name, profile, surf, seg=24, cx=0.0, cy=0.0, cz=0.0, a0=0.0, a1=2 * math.pi, M=None,
          urep=None, smooth=True, caps=True, flutes=0, fdepth=0.0, fy=None, phase=0.0):
    """profile [(r, y, hard)] bottom to top, tracing the OUTSIDE surface. A `hard`
    point is doubled so it keeps a crisp arris. Partial sweeps stay open. UVs: u
    round the girth in whole repeats, v = metres/2 along the profile -- and the
    profile gets a point wherever v crosses a whole tile, so a strip surface never
    needs a face to straddle two copies of the strip. LOD1 halves the segments."""
    if LOD: seg = max(6, seg // 3 if seg >= 24 else seg // 2); flutes = 0
    full = abs((a1 - a0) - 2 * math.pi) < 1e-6
    raw = []
    for i, (r, y, hard) in enumerate(profile):
        raw.append((r, y))
        if hard and 0 < i < len(profile) - 1: raw.append((r, y))
    pts = [raw[0]]; arc = [0.0]
    for p in raw[1:]:
        q = pts[-1]; d = math.hypot(p[0] - q[0], p[1] - q[1])
        a = arc[-1]; k = math.floor(a / 2) + 1
        while d > 1e-9 and 2 * k < a + d - 1e-6:
            t = (2 * k - a) / d
            pts.append((q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t)); arc.append(2.0 * k); k += 1
        pts.append(p); arc.append(a + d)
    ns = seg if full else seg + 1
    angs = [a0 + phase + (a1 - a0) * s / seg for s in range(ns)]
    vs, fs, uvs, n2 = [], [], [], []
    rmax = max(r for r, _ in pts)
    rep = urep or max(1, round(2 * math.pi * rmax / 2 * (a1 - a0) / (2 * math.pi)))
    for (r, y) in pts:
        for a in angs:
            rr = r
            if flutes and fy and fy[0] <= y <= fy[1]:
                rr = r * (1 - fdepth * max(0.0, math.cos(a * flutes)) ** .7)
            vs.append((cx + rr * math.cos(a), cy + y, cz + rr * math.sin(a)))
    def U(s): return rep * s / seg
    for i in range(len(pts) - 1):
        if pts[i] == pts[i + 1]: continue
        dr = pts[i + 1][0] - pts[i][0]; dy = pts[i + 1][1] - pts[i][1]
        for s in range(seg):
            s1 = (s + 1) % ns if full else s + 1
            a = i * ns + s; b = i * ns + s1
            fs.append((a, b, b + ns, a + ns))
            am = (angs[s] + angs[s1]) / 2 if not full else angs[s] + math.pi / seg
            n2.append(Vector((dy * math.cos(am), -dr, dy * math.sin(am))))
            v0, v1 = arc[i] / 2, arc[i + 1] / 2
            uvs.append([(U(s), v0), (U(s + 1), v0), (U(s + 1), v1), (U(s), v1)])
    if caps and full:
        k0 = math.floor(arc[0] / 2)
        if pts[0][0] > 1e-6:
            fs.append(tuple(range(ns))); n2.append(Vector((0, -1, 0))); uvs.append([((vs[k][0] - cx) / 4 + .5, .5 + k0) for k in range(ns)])
        if pts[-1][0] > 1e-6:
            top = (len(pts) - 1) * ns; kt = math.floor(arc[-1] / 2 - 1e-6)
            fs.append(tuple(range(top, top + ns))); n2.append(Vector((0, 1, 0))); uvs.append([((vs[k][0] - cx) / 4 + .5, .5 + kt) for k in range(top, top + ns)])
    return mesh(name, vs, fs, surf, smooth=smooth, M=M, uvs=uvs, normals2=n2)


def sweep(name, profile, frames, surf, closed=False, caps=True, M=None, smooth=False):
    """Moulding sweep. profile: [(a, b)] a CLOSED polygon in the section plane;
    frames: [(origin, A, B)] -> point = origin + A*a + B*b (A, B may be scaled for
    mitres). The tube is a closed manifold, so its winding is fixed by recalc."""
    n = len(profile); vs = []; fs = []
    for o, Av, Bv in frames:
        for a, b in profile: vs.append(tuple(Vector(o) + Vector(Av) * a + Vector(Bv) * b))
    rings = len(frames)
    for i in range(rings - 1 + (1 if closed else 0)):
        j = (i + 1) % rings
        for k in range(n):
            k1 = (k + 1) % n
            fs.append((i * n + k, i * n + k1, j * n + k1, j * n + k))
    if caps and not closed:
        fs.append(tuple(range(n))); fs.append(tuple(range((rings - 1) * n, rings * n)))
    return mesh(name, vs, fs, surf, M=M, solid=True, smooth=smooth)


def path_frames(points, normals, B=(0, 1, 0), closed=False):
    """Mitred frames along a polyline with per-SEGMENT outward normals: interior
    vertices get (n0 + n1) / (1 + n0.n1), one clean mitre per corner."""
    P = [Vector(p) for p in points]; N = [Vector(n) for n in normals]; Bv = Vector(B)
    fr = []; m = len(P)
    for i in range(m):
        if closed:
            n0 = N[i - 1]; n1 = N[i % len(N)]; Av = (n0 + n1) / (1 + n0.dot(n1))
        elif i == 0: Av = N[0]
        elif i == m - 1: Av = N[-1]
        else:
            n0, n1 = N[i - 1], N[i]; Av = (n0 + n1) / (1 + n0.dot(n1))
        fr.append((P[i], Av, Bv))
    return fr


def run_x(x0, x1, y=0.0, z=0.0):
    """Straight horizontal run along +x on the facade: A = +z (out), B = +y (up)."""
    return [(Vector((x0, y, z)), Vector((0, 0, 1)), Vector((0, 1, 0))), (Vector((x1, y, z)), Vector((0, 0, 1)), Vector((0, 1, 0)))]


def corner_frames(y=0.0):
    """The outer-corner wedge for a horizontal moulding between the z=0 facade
    (facing +z) and the x=0 facade (facing +x)."""
    o = Vector((0, y, 0)); up = Vector((0, 1, 0))
    return [(o, Vector((0, 0, 1)), up), (o, Vector((1, 0, 1)), up), (o, Vector((1, 0, 0)), up)]


def arc_frames(cx, cy, R, a0, a1, n, z=0.0, out=(0, 0, 1)):
    fr = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        rad = Vector((math.cos(a), math.sin(a), 0))
        fr.append((Vector((cx, cy, z)) + rad * R, Vector(out), rad))
    return fr


def face_frame(x0, x1, y0, ytop, z, arch=False, nseg=12):
    """Frames for an architrave round an opening (a = projection, b = width out
    from the opening). Rectangular head, or a semicircular one."""
    w = (x1 - x0) / 2; cx = (x0 + x1) / 2
    fr = []; out = Vector((0, 0, 1))
    if not arch:
        pts = [(x0, y0), (x0, ytop), (x1, ytop), (x1, y0)]
        nrm = [Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0))]
        for i, (x, y) in enumerate(pts):
            if i == 0: Bv = nrm[0]
            elif i == 3: Bv = nrm[2]
            else: n0, n1 = nrm[i - 1], nrm[i]; Bv = (n0 + n1) / (1 + n0.dot(n1))
            fr.append((Vector((x, y, z)), out, Bv))
        return fr
    fr.append((Vector((x0, y0, z)), out, Vector((-1, 0, 0))))
    for i in range(nseg + 1):
        a = math.pi - math.pi * i / nseg
        rad = Vector((math.cos(a), math.sin(a), 0))
        fr.append((Vector((cx, ytop, z)) + rad * w, out, rad))
    fr.append((Vector((x1, y0, z)), out, Vector((1, 0, 0))))
    return fr


def fan(name, cx, cy, R, x0, x1, ytop, z, surf, facing, n=16, a0=0.0, a1=math.pi, M=None):
    """The wall face between a semicircular arch and its bounding rectangle: each
    arch point joined to where its radial ray leaves the rectangle, the corners
    filled where neighbouring rays leave by different edges. One sheet."""
    if LOD: n = max(4, n // 2)
    vs, fs, edge = [], [], []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n; dx, dy = math.cos(a), math.sin(a)
        kx = ((x1 - cx) / dx if dx > 1e-6 else (x0 - cx) / dx if dx < -1e-6 else 1e9)
        ky = (ytop - cy) / dy if dy > 1e-6 else 1e9
        k = min(kx, ky)
        edge.append('T' if ky <= kx else ('R' if dx > 0 else 'L'))
        vs += [(cx + R * dx, cy + R * dy, z), (cx + k * dx, cy + k * dy, z)]
    for i in range(n):
        fs.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
        if edge[i] != edge[i + 1]:
            corner = (x1 if 'R' in (edge[i], edge[i + 1]) else x0, ytop, z)
            vs.append(corner); fs.append((2 * i + 1, 2 * i + 3, len(vs) - 1))
    return mesh(name, vs, fs, surf, M=M, facing=facing)


def soffit(name, cx, spring, w, z0, z1, surf, n=16, M=None):
    """The intrados of a round arch: a half cylinder facing its axis."""
    if LOD: n = max(4, n // 2)
    vs, fs = [], []
    for i in range(n + 1):
        a = math.pi * i / n
        for z in (z0, z1): vs.append((cx + w * math.cos(a), spring + w * math.sin(a), z))
    for i in range(n): fs.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    n2 = [Vector((-math.cos(math.pi * (i + .5) / n), -math.sin(math.pi * (i + .5) / n), 0)) for i in range(n)]
    return mesh(name, vs, fs, surf, M=M, normals2=n2, smooth=True)


def arch_wall(name, x0, x1, w, ybot, spring, ytop, zf, depth, surf, soffit_surf=None, back=True, n=16, M=None, bevel=0.0):
    """A wall slab x0..x1, 0..ytop, z from zf-depth to zf, pierced by a round-headed
    opening of half-width w from ybot to spring (+ semicircle)."""
    box(name + ' pierL', x0, -w, 0, spring, zf - depth, zf, surf, bevel=bevel, M=M)
    box(name + ' pierR', w, x1, 0, spring, zf - depth, zf, surf, bevel=bevel, M=M)
    if ybot > 0: box(name + ' sill', -w, w, 0, ybot, zf - depth, zf, surf, M=M)
    fan(name + ' spandrel', 0, spring, w, x0, x1, ytop, zf, surf, (0, 0, 1), n=n, M=M)
    if back: fan(name + ' spandrel back', 0, spring, w, x0, x1, ytop, zf - depth, surf, (0, 0, -1), n=n, M=M)
    soffit(name + ' soffit', 0, spring, w, zf, zf - depth, soffit_surf or surf, n=n, M=M)


def scroll_console(name, x, y0, y1, depth, width, surf, z0=0.0, M=None):
    """An S-scroll bracket in the yz plane: deep at the top, curling back below."""
    h = y1 - y0; pts = []
    N = 4 if LOD else 10
    for i in range(N + 1):
        t = i / N
        zz = depth * (.25 + .75 * (3 * t * t - 2 * t * t * t)) - .12 * depth * math.sin(math.pi * t * 2) * (1 - t)
        pts.append((z0 + zz, y0 + h * t))
    pts += [(z0, y1), (z0, y0)]
    return prism(name, pts, x - width / 2, x + width / 2, surf, M=M, axis='x')


def leaf_sheet(name, cx, cz, a, r0, y0, length, width, out_lean, curl, surf, M=None, rows=6):
    """One stylised acanthus leaf: a V-ribbed strip leaning out, its tip curling."""
    vs, fs = [], []
    rad = Vector((math.cos(a), 0, math.sin(a))); tan = Vector((-math.sin(a), 0, math.cos(a)))
    spine = []
    for i in range(rows + 1):
        t = i / rows
        up = length * (t - .35 * curl * max(0, t - .7) ** 2 / .09)
        out = out_lean * t ** 1.6 + curl * max(0, t - .65) * 1.2
        spine.append(Vector((cx, y0, cz)) + rad * (r0 + out) + Vector((0, up, 0)))
    for i, p in enumerate(spine):
        t = i / rows
        w = width * (math.sin(math.pi * min(1, t * 1.15)) ** .6) * (1 - .25 * t) + .02
        rib = .045 * width * (1 - t)
        for s in (-1, 0, 1):
            vs.append(tuple(p + tan * (s * w / 2) + rad * (rib if s == 0 else -rib * .3)))
    for i in range(rows):
        for k in range(2):
            a0 = i * 3 + k; fs.append((a0, a0 + 1, a0 + 4, a0 + 3))
    mesh(name, vs, fs, surf, M=M, radial=(cx, cz, 1), smooth=True)
    mesh(name + ' back', [tuple(Vector(v) - rad * .025) for v in vs], fs, surf, M=M, radial=(cx, cz, -1), smooth=True)


# ---------------------------------------------------------------- finishing
def save(name, out, ao=True, ao_dist=.6, kind='', budget=None, extra=None):
    objs = [o for o in COL.objects]
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')          # applies bevels
    # crisp arrises, soft curves: split edges sharper than ~38 deg, smooth the rest
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data)
        sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(38)]
        bmesh.ops.split_edges(bm, edges=sharp)
        for f in bm.faces: f.smooth = True
        bm.to_mesh(o.data); bm.free()
        # The bevel modifier interpolates UVs across its chamfers in an order that
        # varies run to run (MEASURED: the same build gave last-bit-different UVs on
        # a few bevelled boxes -- planter, brazier -- with -t 1 and the seed fixed).
        # Snap every UV to a 2^-15 grid (0.06 px on the 2048 sheet), so a rebuild
        # is byte-identical and diffs show only real changes.
        uvd = o.data.uv_layers[0].data
        flat = [0.0] * (2 * len(uvd)); uvd.foreach_get('uv', flat)
        uvd.foreach_set('uv', [round(c * 32768) / 32768 for c in flat])
    groups = {}
    for o in objs: groups.setdefault(o.data.materials[0].name, []).append(o)
    final = []
    for mname, group in sorted(groups.items()):
        for o in bpy.context.scene.objects: o.select_set(False)
        for o in group: o.select_set(True)
        vl.objects.active = group[0]
        if len(group) > 1: bpy.ops.object.join()
        g = vl.objects.active; g.name = f'{name}_{mname}'; final.append(g)
    # HANDEDNESS: models.ts bakes each template relative to the glTF __root__ and
    # leaves the root's handedness flip out, so positions land exactly as designed
    # but the image is the mirror of a right-handed view. Geometry is not mirrored;
    # text panels flip their u instead (the Inscr surface, 'panel_mirror').
    tris = 0
    for o in final:
        col = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = col
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    baked = False
    if ao:
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
        sc.cycles.seed = 9401
        sc.render.bake.target = 'VERTEX_COLORS'
        sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.light_settings.distance = ao_dist
        try:
            for o in bpy.context.scene.objects: o.select_set(False)
            for o in final: o.select_set(True)
            vl.objects.active = final[0]
            bpy.ops.object.bake(type='AO')
            baked = True
        except Exception as e:
            print('AO bake failed', name, e)
    for o in final:
        ca = o.data.color_attributes['Col']; ti = o.data.color_attributes['Tint']
        for d, t in zip(ca.data, ti.data):
            a = (.42 + .58 * d.color[0]) if baked else 1.0
            a *= t.color[0]
            d.color = (a, a, a, 1)
        o.data.color_attributes.remove(ti)
        o.data.color_attributes.active_color = o.data.color_attributes['Col']
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in final: o.select_set(True)
    # only 'Col' as COLOR_0: with the exporter's defaults Blender 5.2 also writes a
    # white COLOR_0 and pushes the baked occlusion to COLOR_1, which Babylon ignores
    bpy.ops.export_scene.gltf(filepath=str(out / f'{name}.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_animations=False, export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_image_format='NONE')
    lo = [min(v.co[i] for o in final for v in o.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for o in final for v in o.data.vertices) for i in range(3)]
    rec = {'file': f'{name}.glb', 'kind': kind, 'tris': tris, 'verts': sum(len(o.data.vertices) for o in final),
           'materials': sorted(groups),
           'min': [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3)],
           'max': [round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)]}
    if budget is not None: rec['budget'] = budget
    if extra: rec.update(extra)
    CATALOG[name] = rec
    for o in final: bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)
    bpy.data.collections.remove(COL); bpy.context.view_layer.update()
    print(f'  {name:26s} {tris:6d} tris  {sorted(groups)}', flush=True)
