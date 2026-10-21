"""Geometry core for Moonmere's Banded Cloisters module library (Blender, headless).

A COPY of the Capital's tools/assets/capital_geom.py generic core (via the approved
mock-up's bc_geom.py), with its own atlas import and SURF table (MOONMERE.md section 5:
"not a shared file: the Caerdun session may lift a shared one later"). Nothing outside
build_moonmere_cloister_modules.py imports it.

Conventions (capital_geom.py's, unchanged):
  * metres; GAME coordinates: x along the facade, y up, +z outward (to the street);
    stored in Blender as (x, -z, y), so a GLB's coordinates ARE game coordinates.
  * one origin per bay: the pavement at the facade plane, centred on the bay; rotation-
    only frames, never mirrored (text and signs flip u instead).
  * a SURFACE names what a face is; it resolves to a ROLE (stone, timber, glass, metal,
    glow) and a place on the one sheet:
      strip  -- full-width tiling strip, box UVs in whole tiles (each strip its own tile
                height, moonmere_cloister_atlas.STRIPS), cut at tile lines (split_v)
      rect   -- a panel: 0..1 across the part (or explicit uvs) into a rectangle
      swatch -- every corner at the centre of a flat-colour square
      flat   -- no texture (brass, glow)
  * the ROLE becomes a material through the module's MODE (below), so one surface table
    serves bays (three materials), roofs (MC_Roof), joinery (MC_Joinery), cards (one).
  * AO baked to COLOR_0 (only 'Col' exported), grey only -- never a colour -- so the
    per-instance wash, glaze and joinery tints multiply onto a white base (MOONMERE.md
    "Per-instance tint"); UVs snapped to 2^-15; every face single-sided.
"""
import bpy, bmesh, math, sys, os
from pathlib import Path
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moonmere_cloister_atlas as A
import moonmere_glb_pack as PACK

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # game -> blender
CI = C.inverted()
COL = None
CATALOG = {}
SCRATCH = '/tmp'     # where the raw Blender export lands before packing (set by the builder)
LOD = 0
TINT = 1.0
OFFSET = Matrix.Identity(4)
# a per-module U offset (in tiles) on every strip surface, so two different bay files side
# by side do not repeat the same 4 m of block pattern
UOFF = 0.0
# part names (nm() prefixes) never split at sharp edges on save
SMOOTH_PARTS = {'crown', 'lem', 'ret', 'jar', 'glb', 'keg', 'bell', 'core', 'leafc'}
# FOLIAGE NORMALS (look pass M2, 2026-10-06: "the dressing is cruder than the architecture"):
# object name -> (centre in Blender space, blend). save() gives every loop of such an object a
# custom normal pointing away from that centre (blended with the face normal), so a crown of
# separate leaf clusters shades as ONE soft rounded mass -- the nature remake's trick
# (client/src/trees.ts), here on opaque leaf-outline polygons instead of alpha cards.
NCENTRE = {}
# 'proj' surfaces: local (x, y) -> (u, v) in [0, 1] over this window (x0, x1, y0, y1)
PROJ = (-2.0, 2.0, -2.4, 12.2)

# The eight materials on disk (MOONMERE.md section 5, "Materials: 8 on disk, 6 bound at
# runtime"). Base colour / roughness are only what a plain glTF viewer shows: the
# instancer binds the sheets by name (manifest.json `materials`).
MATERIALS = {
    'MC_Stone':   ((1, 1, 1), .9, 0.0),    # } mc_facade: one submesh with the night emissive
    'MC_Timber':  ((1, 1, 1), .7, 0.0),    # }
    'MC_Glass':   ((1, 1, 1), .12, 0.0),   # }
    'MC_Roof':    ((1, 1, 1), .35, 0.0),   # } mc_trim: the same sheet, NO emissive (roofs,
    'MC_Joinery': ((1, 1, 1), .62, 0.0),   # }   eaves, joinery, ground, dressing)
    'MC_Metal':   ((.70, .55, .28), .35, .9),
    'MC_Glow':    ((1.0, .77, .43), .4, 0.0),
    'MC_Water':   ((.17, .33, .36), .1, 0.0),
    # A-7: the trees' own RGBA sheet (mc_leaf.png), alpha tested at runtime
    'MC_Leaf':    ((1, 1, 1), .75, 0.0),
}
_MAT = {}


def mat(name):
    m = _MAT.get(name)
    if m is None or m.name not in bpy.data.materials:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes['Principled BSDF']
        c, r, mt = MATERIALS[name]
        p.inputs['Base Color'].default_value = (*c, 1); p.inputs['Roughness'].default_value = r
        p.inputs['Metallic'].default_value = mt
        m.use_backface_culling = True
        _MAT[name] = m
    return m


# MODE: how a module's surface ROLES become materials. 'bay' keeps a bay to three
# (MC_Stone / MC_Timber / MC_Glass: its pantile and joinery fold into stone and timber),
# 'shell' (civic, interiors) adds the roof group and metal, 'roof' and 'trim' put every
# surface on MC_Roof (out of the night glow pass), 'joinery' on MC_Joinery, 'card' on one.
MODE = 'bay'
_ROLE_MAT = {
    'bay':     {'stone': 'MC_Stone', 'timber': 'MC_Timber', 'glass': 'MC_Glass', 'tile': 'MC_Stone', 'join': 'MC_Timber',
                'metal': 'MC_Stone', 'glow': 'MC_Glass'},
    'shell':   {'stone': 'MC_Stone', 'timber': 'MC_Timber', 'glass': 'MC_Glass', 'tile': 'MC_Roof', 'join': 'MC_Timber',
                'metal': 'MC_Metal', 'glow': 'MC_Glow'},
    'roof':    {'stone': 'MC_Roof', 'timber': 'MC_Roof', 'glass': 'MC_Roof', 'tile': 'MC_Roof', 'join': 'MC_Roof',
                'metal': 'MC_Metal', 'glow': 'MC_Glow'},
    'trim':    {'stone': 'MC_Roof', 'timber': 'MC_Roof', 'glass': 'MC_Roof', 'tile': 'MC_Roof', 'join': 'MC_Roof',
                'metal': 'MC_Metal', 'glow': 'MC_Glow'},
    'joinery': {'stone': 'MC_Joinery', 'timber': 'MC_Joinery', 'glass': 'MC_Joinery', 'tile': 'MC_Joinery',
                'join': 'MC_Joinery', 'metal': 'MC_Joinery', 'glow': 'MC_Joinery'},
    'card':    {k: 'MC_Stone' for k in ('stone', 'timber', 'glass', 'tile', 'join', 'metal', 'glow')},
}
for _m in _ROLE_MAT.values():
    _m['leaf'] = 'MC_Leaf'
# 'flat' surfaces (no texture) only exist for metal/glow; in a mode that folds them onto
# the sheet they are drawn as a swatch instead
_FLAT_SWATCH = {'metal': 'brass_p', 'glow': 'lit'}

# surface: (role, kind, region, uv mode, vertex tint)
SURF = {
    'Tufa':    ('stone', 'strip', 'tufa', 'box', 1.0),
    'TufaS':   ('stone', 'strip', 'tufa', 'box', .80),     # tufa in shade (passage vaults, walks)
    'TufaB':   ('stone', 'strip', 'tufa', 'box', .9),      # burned (the Shelf, under its pink wash)
    # S3 review (A-13: "the interior walls render as crisp clean gold tufa, not smoke-dark"): the
    # Burned Shelf's own lining, smoke-blackened tufa
    'TufaC':   ('stone', 'strip', 'tufa', 'box', .26),   # ships x 0.55 (a vertex tint is stored sRGB)
    'Basalt':  ('stone', 'strip', 'basalt', 'box', 1.0),
    'BasaltS': ('stone', 'strip', 'basalt', 'box', .8),
    'Lime':    ('stone', 'strip', 'lime', 'box', 1.0),
    'LimeS':   ('stone', 'strip', 'lime', 'box', .84),
    'Pale':    ('stone', 'strip', 'pale', 'box', 1.0),
    'PaleS':   ('stone', 'strip', 'pale', 'box', .84),
    'Timber':  ('timber', 'strip', 'timber', 'box', 1.0),
    'TimberD': ('timber', 'strip', 'timber', 'box', .72),  # soffits, the inside of a loggia
    'Pantile': ('tile', 'strip', 'pantile', 'box', 1.0),
    'PantileD': ('tile', 'strip', 'pantile', 'box', .58),  # the Long Tower's dark steep cap (an untinted pool)
    # S2: the Mending College's ring roof in the College Arm's PLUM glaze (moonmere-templates.json
    # tint.glazes.plum): the college is one untinted civic pool, so its glaze rides its vertex colour
    'PantilePlum': ('tile', 'strip', 'pantile', 'box', (0.75, 0.42, 0.58)),
    # 2026-10-11: the Exchange's roofs in the Crown's lead glaze, SMOKE-VIOLET (tint.glazes
    # smoke-violet), on the same terms as the college's plum: one untinted civic pool
    'PantileViolet': ('tile', 'strip', 'pantile', 'box', (0.55, 0.57, 0.9)),
    'Copper':  ('tile', 'swatch', 'copper', 'swatch', 1.0),
    'Ridge':   ('tile', 'swatch', 'tile', 'swatch', .85),   # rolls: a flat glaze colour, never tile-sliced
    'Rock':    ('stone', 'rect', 'rock', 'explicit', 1.0),
    'Brass':   ('metal', 'flat', None, 'box', 1.0),
    'Glow':    ('glow', 'flat', None, 'box', 1.0),
}
for _r in ('glass_tall', 'glass_tall_d', 'glass_high', 'glass_sq', 'glass_shop', 'glass_loggia', 'glass_hall',
           'glass_oriel', 'glass_round'):
    SURF[''.join(p.capitalize() for p in _r.split('_'))] = ('glass', 'rect', _r, 'panel', 1.0)
for _r, _role in (('door', 'join'), ('door_oak', 'timber'), ('shutter', 'join'), ('louvre', 'timber'),
                  ('louvre_shut', 'timber'), ('loft', 'timber'), ('goods', 'glass'), ('books', 'timber'),
                  ('sign_quill', 'join'), ('sign_cup', 'join'), ('sign_key', 'join'), ('leaf', 'stone'),
                  ('flowers', 'stone'), ('vine', 'stone'), ('bark', 'stone'), ('scorch', 'stone'), ('board', 'timber'),
                  ('plaque', 'stone'), ('chart', 'glass'), ('linen', 'stone'), ('net', 'stone'), ('eave_band', 'timber'),
                  ('balus', 'timber'), ('arcade', 'stone'), ('foliage', 'stone'), ('foliage_lemon', 'stone'),
                  ('ivy', 'stone'), ('wisteria', 'stone'), ('roses', 'stone'), ('flowers_b', 'stone'), ('flowers_c', 'stone'),
                  ('plaque_moon', 'stone'), ('plaque_lemon', 'stone'), ('cotto', 'stone'),
                  ('scorch_b', 'stone'), ('scorch_c', 'stone'), ('scorch_lip', 'stone'), ('linen_b', 'stone')):
    SURF['R_' + _r] = (_role, 'rect', _r, 'panel', 1.0)
    SURF['X_' + _r] = (_role, 'rect', _r, 'explicit', 1.0)
# S3 review (A-13: "seen from inside the Long Tower's floors and the Alchemists at night, the window
# glass glows amber"): the facade's night sheet lights every texel of a glass rect, whichever side
# it faces, and every MC_ part is one material (A-4) -- so the inside face of a window, painted on
# an interior's lining, is its own rect, daylight panes with NO night twin (dark at night)
SURF['GlassIn'] = ('glass', 'rect', 'glass_in', 'panel', 1.0)
for _s in A.SWATCHES:
    SURF['S_' + _s] = ('glass' if _s in ('lit', 'glass_s', 'ember') else 'stone', 'swatch', _s, 'swatch', 1.0)
for _k in list(A.ELEV['slots']) + ['ltshaft']:
    SURF['Elev_' + _k] = ('stone', 'rect', 'elev_' + _k, 'explicit', 1.0)
# A-7: the leaf sheet's rects (MC_Leaf): explicit 0..1 UVs, or a lathe's (wrapped per face)
for _r in A.LEAF_RECTS:
    SURF['L_' + _r] = ('leaf', 'leafrect', _r, 'explicit', 1.0)


def material_for(surf):
    role, kind = SURF[surf][0], SURF[surf][1]
    return _ROLE_MAT[MODE][role]


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
def _uv_box(p, n, t=2.0):
    """Box projection in TILES of t metres (each strip its own tile height)."""
    ax = max(range(3), key=lambda i: abs(n[i]))
    if ax == 0: return (p[2] * (1 if n[0] > 0 else -1) / t, p[1] / t)
    if ax == 1: return (p[0] / t, p[2] / t + .5)   # half a tile off: no tile line on the facade plane z = 0
    return (p[0] * (1 if n[2] > 0 else -1) / t, p[1] / t)


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


def split_v(bm, t=2.0):
    """Cut box-UV'd faces where their v crosses a whole tile of t metres: faces whose box
    projection is vertical (v = y/t) at y = t*k, horizontal ones (v = z/t) at z = t*k.
    Coplanar cuts: the arris bevel and the sharp-edge split leave them alone."""
    def group(f):
        n = _gn(f.normal); return 'H' if max(range(3), key=lambda i: abs(n[i])) == 1 else 'V'
    for gname, axis in (('V', 1), ('H', 2)):
        vals = [_g(v.co)[axis] for v in bm.verts]
        if not vals: return
        sh = 0.0 if gname == 'V' else .5          # _uv_box's half-tile offset on horizontal faces
        lo, hi = min(vals) / t + sh, max(vals) / t + sh
        for k in range(math.floor(lo + 1e-6) + 1, math.ceil(hi - 1e-6)):
            c = t * (k - sh)
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


def split_u(bm, t, rep, uoff):
    """Cut box-UV'd faces where their u crosses a whole SHEET width (a strip tiles in U, so
    a face may sit on any copy -- but one triangle must sit on ONE copy, or the packer
    must keep its UVs float). u_sheet = (s * c / t + uoff) / rep, where c is the face's
    projection coordinate (game z for x-facing faces, game x otherwise) and s its sign."""
    def group(f):
        n = _gn(f.normal); ax = max(range(3), key=lambda i: abs(n[i]))
        if ax == 0: return ('X', 1 if n[0] > 0 else -1)
        if ax == 1: return ('Y', 1)
        return ('Z', 1 if n[2] > 0 else -1)
    for key in (('X', 1), ('X', -1), ('Y', 1), ('Z', 1), ('Z', -1)):
        axis = 2 if key[0] == 'X' else 0
        sg = key[1]
        faces = [f for f in bm.faces if group(f) == key]
        if not faces: continue
        us = [(sg * _g(v.co)[axis] / t + uoff) / rep for f in faces for v in f.verts]
        for k in range(math.floor(min(us) + 1e-7) + 1, math.ceil(max(us) - 1e-7)):
            c = sg * (k * rep - uoff) * t
            hit = []
            for f in bm.faces:
                if group(f) != key: continue
                cs = [_g(v.co)[axis] for v in f.verts]
                if min(cs) < c - 1e-5 and max(cs) > c + 1e-5: hit.append(f)
            if not hit: continue
            edges = {e for f in hit for e in f.edges}; verts = {v for f in hit for v in f.verts}
            co = Vector((c, 0, 0)) if axis == 0 else Vector((0, -c, 0))
            no = Vector((1, 0, 0)) if axis == 0 else Vector((0, 1, 0))
            bmesh.ops.bisect_plane(bm, geom=list(hit) + list(edges) + list(verts), plane_co=co, plane_no=no, dist=1e-5)
            bm.faces.ensure_lookup_table()


def cut_uv(P, uv, rep, uoff=0.0):
    """band_split's partner for explicitly UV'd strip polygons (roof planes): cut at whole
    tiles in v AND at whole sheet widths in u ((u + uoff) / rep integer), so every piece
    samples one copy of the strip and packs to 16-bit UVs."""
    out = []
    for pts, uvb in band_split(P, uv):
        us = [(t[0] + uoff) / rep for t in uvb]
        polys = [(pts, uvb)]
        for k in range(math.floor(min(us) + 1e-7) + 1, math.ceil(max(us) - 1e-7)):
            lim = k * rep - uoff
            nxt = []
            for pp, uu in polys:
                for keep in (1, -1):
                    res = []
                    poly = [(Vector(a), tuple(b)) for a, b in zip(pp, uu)]
                    for i in range(len(poly)):
                        a, b = poly[i], poly[(i + 1) % len(poly)]
                        da, db = (a[1][0] - lim) * keep, (b[1][0] - lim) * keep
                        if da >= -1e-9: res.append(a)
                        if (da > 1e-9 and db < -1e-9) or (da < -1e-9 and db > 1e-9):
                            tt = da / (da - db)
                            res.append((a[0].lerp(b[0], tt), (lim, a[1][1] + (b[1][1] - a[1][1]) * tt)))
                    if len(res) >= 3:
                        nxt.append(([tuple(p) for p, _ in res], [t for _, t in res]))
            polys = nxt
        out += polys
    return out


def mesh(name, vs, faces, surf, smooth=False, M=None, uvs=None, facing=None, solid=False,
         radial=None, bevel=0.0, normals2=None, tint=1.0, nc=None):
    """vs, faces in LOCAL game coords. uvs: per-face list of per-corner (u, v) --
    tile units for a strip/tile surface (lathes), 0..1 rect-local for 'explicit'.
    facing: flip faces whose normal points away from it (open sheets).
    radial: (cx, cz, sign) -> faces point away from (+1) / toward the vertical axis.
    normals2: per-face expected normal (lathe). solid: closed manifold -> recalc."""
    role, kind, region, mode, stint = SURF[surf]
    material = _ROLE_MAT[MODE][role]
    if kind == 'flat' and material not in ('MC_Metal', 'MC_Glow'):
        kind, region, mode = 'swatch', _FLAT_SWATCH[role], 'swatch'
    tile = A.STRIPS[region][2] if kind == 'strip' else 2.0
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
        split_v(bm, tile)
        split_u(bm, tile, A.STRIPS[region][3], UOFF)
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
        elif kind == 'flat':
            raw = [(0.0, 0.0)] * len(lids)      # untextured (metal, glow): one constant UV
        elif uvs is not None:
            orig = list(faces[src[pi]]); per = uvs[src[pi]]
            raw = [per[orig.index(me.loops[li].vertex_index)] for li in lids]
        elif mode in ('panel', 'panel_mirror'):
            raw = None
        elif mode == 'proj':
            raw = [((vg[me.loops[li].vertex_index][0] - PROJ[0]) / (PROJ[1] - PROJ[0]),
                    (vg[me.loops[li].vertex_index][1] - PROJ[2]) / (PROJ[3] - PROJ[2])) for li in lids]
        elif mode == 'roof':
            raw = [_uv_roof(vg[me.loops[li].vertex_index], ng) for li in lids]
        else:
            raw = [_uv_box(vg[me.loops[li].vertex_index], ng, tile) for li in lids]
        if raw is None: continue
        if kind == 'strip':
            vc = sum(r[1] for r in raw) / len(raw); k = math.floor(vc + 1e-6)
            off = 0.0 if uvs is not None else UOFF
            for li, (u, v) in zip(lids, raw):
                uvl.data[li].uv = A.strip_uv(region, u + off, min(1.0, max(0.0, v - k)))
        elif kind in ('rect', 'swatch'):
            for li, (u, v) in zip(lids, raw):
                uvl.data[li].uv = A.rect_uv(region, min(1.0, max(0.0, u)), min(1.0, max(0.0, v)))
        elif kind == 'leafrect':
            # (a lathe's UVs run on in tiles: each face is brought back to one copy of its rect)
            ku = math.floor(min(r[0] for r in raw) + 1e-6); kv = math.floor(min(r[1] for r in raw) + 1e-6)
            for li, (u, v) in zip(lids, raw):
                uvl.data[li].uv = A.leaf_uv(region, min(1.0, max(0.0, u - ku)), min(1.0, max(0.0, v - kv)))
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
                uvl.data[li].uv = A.rect_uv(region, uu, vv)
    for p in me.polygons: p.use_smooth = smooth
    Mt = OFFSET @ M if M is not None else OFFSET
    me.transform(C @ Mt @ CI)
    # (S2: a surface's tint may be a COLOUR -- a civic shell is one untinted pool, so a glazed
    # roof on it carries its glaze in the vertex colour, the multiplier the houses' glaze pools
    # take per instance; every grey tint is written exactly as before)
    if isinstance(stint, tuple):
        tc = tuple(c * tint * TINT for c in stint)
    else:
        t = stint * tint * TINT
        tc = (t, t, t)
    ca = me.color_attributes.new('Tint', 'BYTE_COLOR', 'POINT')
    for d in ca.data: d.color = (tc[0], tc[1], tc[2], 1)
    o = bpy.data.objects.new(name, me); COL.objects.link(o); me.materials.append(mat(material))
    if nc is not None:
        # nc = (cx, cy, cz, blend) in LOCAL game coords: the soft-mass centre (FOLIAGE NORMALS)
        cg = (C @ Mt @ CI) @ Vector((nc[0], -nc[2], nc[1]))
        NCENTRE[o.name] = (cg, nc[3])
    if bevel and LOD == 0:
        mod = o.modifiers.new('arris', 'BEVEL'); mod.width = bevel; mod.segments = 1; mod.limit_method = 'ANGLE'
    return o


def band_split(P, uv):
    """Cut a convex planar polygon (points P, per-corner (u, v) in tile units, linear over
    the plane) into pieces whose v stays inside one whole tile [k, k+1]: how an explicitly
    UV'd face samples one copy of a U-tiling strip (split_v does this for box faces)."""
    vs = [t[1] for t in uv]
    out = []
    for k in range(math.floor(min(vs) + 1e-6), math.ceil(max(vs) - 1e-6)):
        poly = [(Vector(p), tuple(t)) for p, t in zip(P, uv)]
        for lim, keep in ((k, 1), (k + 1, -1)):
            res = []
            for i in range(len(poly)):
                a, b = poly[i], poly[(i + 1) % len(poly)]
                da, db = (a[1][1] - lim) * keep, (b[1][1] - lim) * keep
                if da >= -1e-9: res.append(a)
                if (da > 1e-9 and db < -1e-9) or (da < -1e-9 and db > 1e-9):
                    t = da / (da - db)
                    res.append((a[0].lerp(b[0], t), (a[1][0] + (b[1][0] - a[1][0]) * t, lim)))
            poly = res
            if len(poly) < 3: break
        if len(poly) >= 3:
            out.append(([tuple(p) for p, _ in poly], [t for _, t in poly]))
    return out


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
        # organic pieces (a lemon crown, its lemons) stay smooth whatever their facet angles
        # (review 2026-10-06: split at 38 deg the crowns read as faceted blobs)
        organic = o.name.split('.')[0].rstrip('0123456789') in SMOOTH_PARTS
        sharp = [] if organic else [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(38)]
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
    for o in objs:
        if o.name not in NCENTRE: continue
        cg, bl = NCENTRE.pop(o.name)
        # PER VERTEX (a per-loop blend with each face's normal split every shared vertex:
        # MEASURED 2x the bytes on a vine): away from the centre, blended with the vertex's own
        me_ = o.data; cn = []
        for v in me_.vertices:
            r = (v.co - cg)
            r = r.normalized() if r.length > 1e-6 else v.normal
            cn.append(tuple(round(c, 5) for c in (r * bl + v.normal * (1 - bl)).normalized()))
        me_.normals_split_custom_set_from_vertices(cn)
    if os.environ.get('MC_BREAKDOWN'):
        import re, collections
        cnt = collections.Counter()
        for o in objs:
            o.data.calc_loop_triangles(); cnt[re.sub(r'\d+$', '', o.name.split('.')[0])] += len(o.data.loop_triangles)
        print('BREAKDOWN', name, cnt.most_common(14), flush=True)
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
        col = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')   # per POINT: a corner colour would split shared vertices on export
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
        # A-7 (the look review: "baked occlusion leaves dark diagonal smudges on plain
        # plaster"): AO lives per VERTEX, so a big quad of wall darkened from one corner
        # across its whole triangle. A vertex of a large face (over 3 m2) keeps only a
        # fifth of the occlusion: the plain faces stay even, the small parts keep theirs
        big = set()
        for poly in o.data.polygons:
            if poly.area > 3.0: big.update(poly.vertices)
        for i, (d, t) in enumerate(zip(ca.data, ti.data)):
            a = ((.8 + .2 * d.color[0]) if i in big else (.42 + .58 * d.color[0])) if baked else 1.0
            d.color = (a * t.color[0], a * t.color[1], a * t.color[2], 1)
        o.data.color_attributes.remove(ti)
        o.data.color_attributes.active_color = o.data.color_attributes['Col']
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in final: o.select_set(True)
    # only 'Col' as COLOR_0: with the exporter's defaults Blender 5.2 also writes a
    # white COLOR_0 and pushes the baked occlusion to COLOR_1, which Babylon ignores
    raw = Path(SCRATCH) / f'{name}.raw.glb'
    raw.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(raw), export_format='GLB', use_selection=True,
                              export_apply=True, export_animations=False, export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_image_format='NONE', export_extras=False)
    # MOONMERE.md section 5: the packer rewrites COLOR_0 to normalised bytes, atlas UVs to
    # normalised shorts (where every triangle fits one sheet copy) and indices to uint16
    packed = PACK.pack(raw.read_bytes())
    (out / f'{name}.glb').write_bytes(packed['glb'])
    raw.unlink()
    lo = [min(v.co[i] for o in final for v in o.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for o in final for v in o.data.vertices) for i in range(3)]
    rec = {'file': f'{name}.glb', 'kind': kind, 'tris': tris, 'verts': packed['verts'], 'bytes': len(packed['glb']),
           'uv16': packed['uv16'],
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
