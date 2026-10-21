"""Moonmere's BANDED CLOISTERS module library (MOONMERE.md, the build contract).

Reproduce everything -- sheets, every template and LOD, manifest.json -- with ONE command:

    blender -b --python tools/assets/build_moonmere_cloister_modules.py

It runs `python3 tools/assets/paint_moonmere_cloister_textures.py` first (pass
`-- --no-paint` to skip that, or `-- name1 name2` to rebuild only those templates, which
merges into the existing manifest). Output: client/public/models/moonmere-cloister/ --
ONLY the templates of client/src/moonmere-templates.json (156 at S5), the sheets they bind,
mc_facade.json and manifest.json. A full build deletes any .glb there it did not write.
Raw Blender exports pass through tools/assets/build/moonmere-cloister/ (gitignored) and
are packed by moonmere_glb_pack.py. Deterministic: fixed seeds, snapped UVs, ordered
JSON, a fixed AO sampler seed.

EVOLVED from the approved Banded Cloisters mock-up generator (not on the branch;
MOONMERE.md section 5, "evolve it; do not restart"), with the review's flaws fixed:
  * LOD1 was 66% of LOD0 (the eaves were always drawn): the eave is now split in three
    (MOONMERE.md "the answer to the 66% eave problem") -- the always-drawn skyline slice
    carries the slab, fascia and a PAINTED bracket soffit (<= 120 triangles), eave_brk
    carries the 3D brackets and roll ends at LOD0 only, and every bay's LOD1 is the same
    bay with only its outline kept (openings stay openings, an oriel stays an oriel);
  * 7.3 MB: one 2048^2 sheet, packed GLBs (bytes, shorts), lean always-drawn shells;
  * "plain and the same" (Philip, MM-0): every ground storey has life -- deep stepped
    doorways, arched shopfronts with stalls and goods, three-arch loggias opening the
    courts, benches built into the plinths, lit lamp niches, tile plaques, oriels,
    balconies and galleries -- and the mounts for lamps, signs, pentices, planters, vines
    and shutters that planDressing() fills;
  * dark, heavy streets: a light, quiet tufa; the bands are MODELLED basalt courses (a
    storey band and a thin rule over it) that read as ruled lines;
  * a gold box under a hip: roof form varies (hip, gable with an oculus, pavilion,
    monopitch into the court, flat terrace with parapet and pergola, altana, tower caps);
  * the stretched turret roof: cap_turret; the floating terrace walls: parapet_run is a
    continuous run with its outer face carried down over the riser's lip (no stagger),
    riser_rock dresses the bare risers (D-16).

FRAMES (MOONMERE.md section 4 "Frames", D-13; capital_geom.py conventions):
  * a bay's origin is the pavement at the facade plane, centred; +z is its street; the
    joint is on -x; never mirrored. Court-side files are placed turned pi.
  * roof slices (roof_run, roof_mono, roof_flat, pergola, altana, chimney, eave_brk):
    origin at the bay centre on the facade plane, y 0 = the eave datum (placed at
    groundY + eave[rank]).
  * row-END pieces that serve both ends from one file (ret_flank, ret_low, roof_hip_end,
    roof_gable_end): origin at the END WALL's line at MID-DEPTH (the body's centre line,
    z = -depth/2 in the house frame), +x outward through the end; the +x end takes the
    house's yaw, the -x end yaw + pi. roof_mono_end is symmetric about its own plane:
    origin at the end wall on the facade plane, the same yaw at both ends. roof_pav:
    origin at the house's centre at mid-depth. corner_quoin: the +x front corner; the -x
    corner takes yaw - pi/2. Every file's `origin` is written into manifest.json.
  * towers and civic shells: origin at the footprint centre on its ground, +z the front.
"""
import sys, math, json, subprocess, hashlib, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector, Matrix
import moonmere_cloister_geom as G
import moonmere_cloister_atlas as A
from moonmere_cloister_geom import box, quad, prism, lathe, mesh, card

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/public/models/moonmere-cloister'
BUILD = ROOT / 'tools/assets/build/moonmere-cloister'
TEMPLATES = json.loads((ROOT / 'client/src/moonmere-templates.json').read_text())
LAYOUT_PATH = ROOT / 'client/src/moonmere-layout.json'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PAINT = '--no-paint' not in argv
ONLY = {a for a in argv if not a.startswith('--')} or None
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)
G.SCRATCH = str(BUILD)
if PAINT:
    subprocess.run(['python3', str(Path(__file__).resolve().parent / 'paint_moonmere_cloister_textures.py'), str(OUT)], check=True)

# ---------------------------------------------------------------- datums (moonmere-templates.json)
DAT = TEMPLATES['datums']
BAY = DAT['bay']; ST = DAT['storey']
PLINTH = DAT['plinth']; EAVE = DAT['eave']; DEPTH = DAT['depth']
OVH = DAT['overhang']; TOVH = DAT['towerOverhang']; LTOVH = DAT['longTowerOverhang']
PARAPET = DAT['parapet']
GATE_W, GATE_H = DAT['gate']
DOOR_W, DOOR_H = DAT['door']
SF = DAT['streetFlight']
LEVELS = DAT['levels']
POD = 2.4                      # podium below the pavement: a stepped house never shows daylight under it
PITCH = math.tan(math.radians(18))
TURRET_TOP = 14.2              # half_turret's top (cap_turret goes there), from the turret's ground
D = 9.0                        # the depth every pitched roof, return and gate passage is built for

# DET: 0 = full LOD0; 1 = MID (the always-drawn civic shells: openings, sills, lintels and
# voussoirs kept, small things dropped); 2 = LOD1 (only what makes the outline)
DET = 0
MOUNTS = []
N = [0]


def d0(): return DET == 0
def d01(): return DET <= 1
def far(): return DET == 2


def nm(p='p'):
    N[0] += 1
    return f'{p}{N[0]}'


def _gm(x, y, z):
    """A local point -> the module's frame (through the current G.at offset)."""
    v = G.OFFSET @ Vector((x, y, z, 1.0))
    return v.x, v.y, v.z


def mount(kind, x, y, z, yaw=0.0, axes=None, **kw):
    """A dressing/joinery mount, in the MODULE's frame (offsets applied): where
    planDressing() / the joinery pools put a lamp, sign, pentice, planter, vine, shutters
    or door leaf on this file. yaw is added to the piece's own yaw."""
    gx, gy, gz = _gm(x, y, z)
    M = G.OFFSET.to_3x3()
    fwd = M @ Vector((math.sin(yaw), 0, math.cos(yaw)))
    yy = math.atan2(fwd.x, fwd.z)
    rec = {'kind': kind, 'x': round(gx, 3), 'y': round(gy, 3), 'z': round(gz, 3), 'yaw': round(yy, 4)}
    if axes: rec['axes'] = [round(a, 4) for a in axes]
    rec.update(kw)
    MOUNTS.append(rec)


def RY(psi, x=0.0, y=0.0, z=0.0):
    c, s = math.cos(psi), math.sin(psi)
    return Matrix(((c, 0, s, x), (0, 1, 0, y), (-s, 0, c, z), (0, 0, 0, 1)))


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation(Vector((x, y, z)))


def SC(sx=1.0, sy=1.0, sz=1.0):
    return Matrix.Diagonal(Vector((sx, sy, sz, 1.0)))


# ====================================================================== openings and walls
def arc(a, b, ys, rise, n=8):
    """Points along a segmental arch head from (a, ys) to (b, ys) over the top."""
    w = (b - a) / 2; cx = (a + b) / 2
    if rise <= 1e-6:
        return [(a, ys), (b, ys)], None
    if far(): n = max(3, n // 2)
    elif DET == 1: n = max(4, n // 2 + 1)     # the always-drawn shells: bytes (MOONMERE.md O-7), shallow heads hide it
    R = (w * w + rise * rise) / (2 * rise); cy = ys + rise - R
    al = math.atan2(ys - cy, w)
    pts = []
    for i in range(n + 1):
        t = math.pi - al - (math.pi - 2 * al) * i / n
        pts.append((cx + R * math.cos(t), cy + R * math.sin(t)))
    pts[0] = (a, ys); pts[-1] = (b, ys)
    return pts, (cx, cy, R, al)


def hole(a, b, c, ys, rise=0.0, n=8):
    top, cc = arc(a, b, ys, rise, n)
    return {'a': a, 'b': b, 'c': c, 'ys': ys, 'rise': rise, 'top': top, 'cc': cc}


def wall(x0, x1, y0, y1, surf, holes=(), z=0.0, facing=1):
    """A wall face on the plane z (facing +z, or -z with facing=-1) from x0..x1, y0..y1,
    pierced by holes (each one x-run: a rect below its top curve). Holes must not share
    an x-run (stack storeys as separate walls)."""
    vs, fs = [], []

    def q(p0, p1, p2, p3):
        i = len(vs); vs.extend([p0, p1, p2, p3]); fs.append((i, i + 1, i + 2, i + 3))
    xc = x0
    for h in sorted([h for h in holes if h], key=lambda h: h['a']):
        a, b = h['a'], h['b']
        if b <= x0 or a >= x1: continue
        if a > xc + 1e-6: q((xc, y0, z), (a, y0, z), (a, y1, z), (xc, y1, z))
        c = max(h['c'], y0)
        if c > y0 + 1e-6 and c < y1: q((a, y0, z), (b, y0, z), (b, c, z), (a, c, z))
        top = [(x_, y_) for x_, y_ in h['top']]
        if len(top) > 2 and all(y1 - y_ > 1e-5 for x_, y_ in top):
            # the wall over an arched head as ONE polygon (the arch's extrados up to y1):
            # one triangle a segment instead of two
            i0 = len(vs)
            vs.extend([(x_, y_, z) for x_, y_ in top] + [(top[-1][0], y1, z), (top[0][0], y1, z)])
            fs.append(tuple(range(i0, len(vs))))
        else:
            for (xa, ya), (xb, yb) in zip(top, top[1:]):
                if y1 - max(ya, yb) > 1e-5:
                    q((xa, ya, z), (xb, yb, z), (xb, y1, z), (xa, y1, z))
        xc = max(xc, b)
    if x1 > xc + 1e-6: q((xc, y0, z), (x1, y0, z), (x1, y1, z), (xc, y1, z))
    if fs: mesh(nm('wall'), vs, fs, surf, facing=(0, 0, facing))


def reveal(h, z, d, surf='PaleS', head_from=None, sill=True, jambs=True, facing=1, head=True, head_to=None):
    """The reveal of a hole from the plane z back to z - d*facing."""
    a, b, c, ys = h['a'], h['b'], h['c'], h['ys']
    z1 = z - d * facing
    vs, fs, n2 = [], [], []

    def q(p, nrm):
        i = len(vs); vs.extend(p); fs.append(tuple(range(i, i + 4))); n2.append(Vector(nrm))
    if jambs and ys > c + 1e-4:
        q([(a, c, z), (a, c, z1), (a, ys, z1), (a, ys, z)], (1, 0, 0))
        q([(b, c, z), (b, c, z1), (b, ys, z1), (b, ys, z)], (-1, 0, 0))
    if sill and not (DET >= 1 and c > 2.0):
        q([(a, c, z), (b, c, z), (b, c, z1), (a, c, z1)], (0, 1, 0))
    zh = z if head_from is None else head_from
    zt = z1 if head_to is None else head_to
    cc = h['cc']
    for (xa, ya), (xb, yb) in (zip(h['top'], h['top'][1:]) if head and abs(zh - zt) > 1e-4 else ()):
        if cc:
            mx, my = (xa + xb) / 2, (ya + yb) / 2
            nrm = (cc[0] - mx, cc[1] - my, 0)
        else:
            nrm = (0, -1, 0)
        q([(xa, ya, zh), (xb, yb, zh), (xb, yb, zt), (xa, ya, zt)], nrm)
    if fs: mesh(nm('rev'), vs, fs, surf, normals2=n2)


def infill_above(h, ycut, z, surf, facing=1):
    """The part of an arched hole's head above y = ycut, as one polygon (a fanlight over a
    lintel). Review 2026-10-06: infill with c above the springing wound a self-crossing
    polygon, an inside-out strip at the door head."""
    pts = []
    top = h['top']
    for (xa, ya), (xb, yb) in zip(top, top[1:]):
        if ya >= ycut: pts.append((xa, ya))
        if (ya - ycut) * (yb - ycut) < 0:
            t = (ycut - ya) / (yb - ya); pts.append((xa + (xb - xa) * t, ycut))
    if top[-1][1] >= ycut: pts.append(top[-1])
    if len(pts) < 3: return
    vs = [(x, y, z) for x, y in pts]
    mesh(nm('fan'), vs, [tuple(range(len(vs)))], surf, facing=(0, 0, facing))


def infill(h, z, surf, c=None, facing=1):
    a, b = h['a'], h['b']; c = h['c'] if c is None else c
    pts = [(a, c, z), (b, c, z)] + [(x, y, z) for x, y in reversed(h['top'])]
    mesh(nm('fill'), pts, [tuple(range(len(pts)))], surf, facing=(0, 0, facing))


def pbox(name, x0, x1, y0, y1, z0, z1, surf, lean=None, keep=None):
    """A box fixed to a wall face: its back (z0) face is buried in the wall and never drawn.
    lean ('front' or 'front_top'): on the always-drawn shells (DET 1) only those faces --
    a 10 cm proud pilaster or sill reads by its face and its shadow line. keep: the faces to
    draw at every DET (0 -x, 1 +x, 2 -y, 3 +y, 4 front), where the others are covered (a
    post whose sides ARE a reveal's jambs z-fought them)."""
    vs = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (1, 5, 7, 3)]
    ns = [(-1, 0, 0), (1, 0, 0), (0, -1, 0), (0, 1, 0), (0, 0, 1)]
    if keep is None and lean and DET >= 1:
        keep = (4,) if lean == 'front' else (3, 4)
    if keep is not None:
        fs = [fs[i] for i in keep]; ns = [ns[i] for i in keep]
    mesh(name, vs, fs, surf, normals2=[Vector(n) for n in ns])


def rect_course(hx, hz, out, y0, y1, surf, top_in=0.0, bot_in=0.0, cx=0.0, cz=0.0, top=True, bottom=True):
    """A course round a rectangle (+-hx, +-hz) standing `out` proud of its walls (a corbel
    course, a band, a sill or a wall plate): its four outer faces meeting at the corners, its
    top and underside as MITRED rings reaching back to top_in / bot_in proud of the wall --
    built once, not as four boxes whose ends and tops overlapped at every corner (review
    2026-10-06: tower_b's gallery and the Sea Lamp's corbels z-fought there)."""
    for k, M in enumerate(face_frames(cx, cz, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            ho = half + out
            quad(nm('rco'), [(-ho, y0, out), (ho, y0, out), (ho, y1, out), (-ho, y1, out)], surf, (0, 0, 1))
            for on, y, inn, nrm in ((top, y1, top_in, 1), (bottom, y0, bot_in, -1)):
                if on and inn < out - 1e-4:
                    hi = half + inn
                    quad(nm('rct'), [(-ho, y, out), (ho, y, out), (hi, y, inn), (-hi, y, inn)], surf, (0, nrm, 0))


def ring_course(hin, hout, y0, y1, surf, top_in=None, bot_in=None, cx=0.0, cz=0.0, top=True, bottom=True):
    """rect_course round a square of half-width hin, out to hout (top_in / bot_in absolute)."""
    rect_course(hin, hin, hout - hin, y0, y1, surf, top_in=(hin if top_in is None else top_in) - hin,
                bot_in=(hin if bot_in is None else bot_in) - hin, cx=cx, cz=cz, top=top, bottom=bottom)


def obox(name, x0, x1, y0, y1, z0, z1, surf, omit=('-y',)):
    """A box without the faces named in omit ('-x', '+x', '-y', '+y', '-z', '+z'): a curb on a
    deck never shows its underside."""
    vs = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    allf = {'-x': ((0, 1, 3, 2), (-1, 0, 0)), '+x': ((4, 6, 7, 5), (1, 0, 0)), '-y': ((0, 4, 5, 1), (0, -1, 0)),
            '+y': ((2, 3, 7, 6), (0, 1, 0)), '-z': ((0, 2, 6, 4), (0, 0, -1)), '+z': ((1, 5, 7, 3), (0, 0, 1))}
    keep = [v for k, v in allf.items() if k not in omit]
    mesh(name, vs, [f for f, _ in keep], surf, normals2=[Vector(n_) for _, n_ in keep])


def voussoirs(h, t, z0, z1, n=9, surfs=('Pale', 'Basalt'), key=1.25):
    """Banded voussoirs (pale and basalt alternating: the direction's signature arch) or,
    on a flat head, a lintel of alternating blocks.

    Every stone carries its INTRADOS (the arch's inner surface) over its whole depth z0..z1:
    the caller's reveal starts its head at z1 (head_from), so between the wall face and z1 the
    voussoirs ARE the arch's soffit. Review 2026-10-06: the face-only voussoirs left that strip
    open, and the sky or the R1 grass inside a body showed in every arch head ("the drawn
    ground never shows"). LOD1 (far): the ring is painted flat on the wall (its faces only, a
    few stones), so the banded head keeps its outline at the 45 m switch (MOONMERE.md "A LOD1
    keeps its bay's outline")."""
    if far():
        if h['cc']:
            _flat_ring(h, t, z0 - .038, max(3, (n // 3) | 1), surfs)
        return
    if DET == 1: n = max(5, (n // 2) | 1)
    if not h['cc']:
        a, b, ys = h['a'], h['b'], h['ys']
        k = max(3, n // 2) | 1
        if DET == 1: k = 3
        for i in range(k):
            xa = a - .1 + (b - a + .2) * i / k; xb = a - .1 + (b - a + .2) * (i + 1) / k
            pbox(nm('lint'), xa, xb, ys, ys + t, z1, z0, surfs[i % 2])
        return
    cx, cy, R, al = h['cc']
    t0 = math.pi - al; span = math.pi - 2 * al
    # only the faces that can be seen: each stone's face, its extrados and its soffit lip,
    # and the two outer ends (the radial joints between stones touch: never drawn)
    for s_i, surf in enumerate(surfs):
        vs, fs, ns = [], [], []
        for i in range(s_i, n, 2):
            a0 = t0 - span * i / n; a1 = t0 - span * (i + 1) / n
            tt = t * (key if i == n // 2 else 1)
            P = lambda a, r, z: (cx + r * math.cos(a), cy + r * math.sin(a), z)
            q0 = len(vs)
            vs += [P(a0, R, z0), P(a0, R + tt, z0), P(a1, R + tt, z0), P(a1, R, z0)]
            fs.append((q0, q0 + 3, q0 + 2, q0 + 1)); ns.append(Vector((0, 0, 1)))
            am = (a0 + a1) / 2
            if DET == 1: continue
            q1 = len(vs)
            vs += [P(a0, R + tt, z0), P(a0, R + tt, z1), P(a1, R + tt, z1), P(a1, R + tt, z0)]
            fs.append((q1, q1 + 1, q1 + 2, q1 + 3)); ns.append(Vector((math.cos(am), math.sin(am), 0)))
            for e, a in ((0, a0), (n - 1, a1)):
                if i == e:
                    q3 = len(vs)
                    vs += [P(a, R, z0), P(a, R + tt, z0), P(a, R + tt, z1), P(a, R, z1)]
                    tn = Vector((-math.sin(a), math.cos(a), 0)) * (1 if e == 0 else -1)
                    fs.append((q3, q3 + 1, q3 + 2, q3 + 3)); ns.append(tn)
        if fs: mesh(nm('vous'), vs, fs, surf, normals2=ns)
    # the intrados over the voussoirs' whole depth, on the HOLE's own polygon (the same points
    # as the wall's cut and the reveal's head, so the three meet without a slit)
    vs, fs, ns = [], [], []
    for (xa, ya), (xb, yb) in zip(h['top'], h['top'][1:]):
        q = len(vs)
        vs += [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)]
        fs.append((q, q + 1, q + 2, q + 3)); ns.append(Vector((cx - (xa + xb) / 2, cy - (ya + yb) / 2, 0)))
    if fs: mesh(nm('intr'), vs, fs, 'PaleS', normals2=ns)


def _flat_ring(h, t, z0, n, surfs):
    """LOD1's banded arch head: the voussoir ring's FACES only, a few stones, laid on the wall."""
    cx, cy, R, al = h['cc']
    t0 = math.pi - al; span = math.pi - 2 * al
    for s_i, surf in enumerate(surfs):
        vs, fs = [], []
        for i in range(s_i, n, 2):
            a0 = t0 - span * i / n; a1 = t0 - span * (i + 1) / n
            P = lambda a, r: (cx + r * math.cos(a), cy + r * math.sin(a), z0)
            q = len(vs)
            vs += [P(a0, R), P(a0, R + t), P(a1, R + t), P(a1, R)]
            fs.append((q, q + 3, q + 2, q + 1))
        if fs: mesh(nm('fring'), vs, fs, surf, facing=(0, 0, 1))


def band(y, hgt=.24, surf='Basalt', x0=-2.0, x1=2.0, proud=.05, back=.08):
    """A MODELLED basalt course (MOONMERE.md: the bands are modelled courses that read as
    ruled lines, not noise). LOD1: one face quad."""
    if far():
        quad(nm('bandq'), [(x0, y, proud), (x1, y, proud), (x1, y + hgt, proud), (x0, y + hgt, proud)], surf, (0, 0, 1))
        return
    pbox(nm('band'), x0, x1, y, y + hgt, -back, proud, surf)


def rule(y, x0=-2.0, x1=2.0, holes=()):
    """The storey band and the thin rule 0.32 over it: the ruling of the Banded Cloisters.
    The rule is cut where a window passes through it. (Review 2026-10-06: at 0.24 the storey
    band read as a thick dark stripe; at 0.18 it reads as a ruled line.)"""
    band(y - .09, .18, x0=x0, x1=x1)
    if far(): return
    yr = y + .3
    xs = [x0]
    for h in sorted([h for h in holes if h], key=lambda h: h['a']):
        top = h['ys'] + h['rise']
        if h['c'] - .2 < yr + .1 and top + .5 > yr:
            xs += [h['a'] - .2, h['b'] + .2]
    xs.append(x1)
    for xa, xb in zip(xs[::2], xs[1::2]):
        if xb - xa > .1: pbox(nm('rule'), xa, xb, yr, yr + .1, -.05, .03, 'Basalt')


def plinth(x0=-2.0, x1=2.0, top=1.2, gaps=(), surf='Basalt', z0=.22, z1=.06, coping=True, mitre=False):
    """Battered basalt plinth with the podium below the pavement (to -POD), cut at gaps.
    mitre (A-7; the look review: "the Archive's rear plinth splits at its corner with a
    tilted wedge"): x0 and x1 are the building's corners, so each end runs out to meet the
    next face's plinth on the diagonal -- its foot by z0, its top by z1, its coping by its
    own projection -- instead of stopping square and leaving the corner open."""
    segs = []; xc = x0
    for g0, g1 in sorted(gaps):
        if g0 > xc: segs.append((xc, g0))
        xc = max(xc, g1)
    if x1 > xc: segs.append((xc, x1))
    for xa, xb in segs:
        ma = mitre and abs(xa - x0) < 1e-6; mb = mitre and abs(xb - x1) < 1e-6
        fa, fb = (xa - z0 if ma else xa), (xb + z0 if mb else xb)
        ta, tb = (xa - z1 if ma else xa), (xb + z1 if mb else xb)
        quad(nm('pod'), [(fa, -POD, z0), (fb, -POD, z0), (fb, 0, z0), (fa, 0, z0)], surf, (0, 0, 1))
        quad(nm('bat'), [(fa, 0, z0), (fb, 0, z0), (tb, top, z1), (ta, top, z1)], surf, (0, .14, 1))
        if coping and not far():
            ce = z1 + .07
            pbox(nm('cope'), xa - (ce if ma else 0), xb + (ce if mb else 0), top - .06, top + .06, -.04, ce, 'Pale')
        else:
            quad(nm('pcap'), [(xa, top, z1), (xb, top, z1), (xb, top, 0), (xa, top, 0)], surf, (0, 1, 0))
        for xe, sgn in ((xa, -1), (xb, 1)):
            if any(abs(xe - g) < 1e-6 for gg in gaps for g in gg):
                quad(nm('pend'), [(xe, -POD, 0), (xe, -POD, z0), (xe, top, z1), (xe, top, 0)], surf, (sgn, 0, 0))


def bench(x0, x1, z=.22, seat=.46, depth=.42):
    """A stone bench built into the plinth: a pale slab on basalt corbels (MOONMERE.md "st_win
    carries a stone bench in the plinth") -- somewhere to sit and talk, at every house."""
    if far(): return
    box(nm('bseat'), x0, x1, seat - .09, seat, z - .02, z + depth, 'Pale')
    n = max(2, int((x1 - x0) / 1.1) + 1)
    for k in range(n):
        x = x0 + .2 + (x1 - x0 - .4) * k / (n - 1)
        prism(nm('bcorb'), [(z - .02, 0), (z + depth - .08, seat - .09), (z - .02, seat - .09)], x - .09, x + .09, 'Basalt', axis='x')


FLATWIN = False      # while set, windows are painted quads laid on the wall (no hole, no reveal)


def window(cx, sill, w, h, glass, z=0.0, d=.3, rise=0.0, vous=0.0, lintel=None, frame=False, sill_slab=True,
           shutters=False, n=7, grille=False, balconette=False):
    a, b = cx - w / 2, cx + w / 2
    if FLATWIN:
        # a painted-on window that keeps its OUTLINE (review 2026-10-06: the LOD1 rectangles
        # popped at 45 m): an arched pane under its flat banded ring, or a pane under its lintel;
        # a balconette keeps its slab and a painted rail
        top = sill + h
        if rise > 0:
            Hf = hole(a, b, sill, top - rise, rise, 6)
            infill(Hf, z + .012, glass)
            if vous: _flat_ring(Hf, vous, z + .014, 5, ('Pale', 'Basalt'))
        else:
            quad(nm('fw'), [(a, sill, z + .012), (b, sill, z + .012), (b, top, z + .012), (a, top, z + .012)], glass, (0, 0, 1))
            if lintel or vous:
                quad(nm('fwl'), [(a - .15, top, z + .014), (b + .15, top, z + .014), (b + .15, top + .25, z + .014), (a - .15, top + .25, z + .014)],
                     lintel or 'Basalt', (0, 0, 1))
        if balconette:
            pbox(nm('bcs'), a - .25, b + .25, sill - .16, sill - .04, 0, .55, 'Pale', lean='front_top')
            card(nm('bcr'), a - .22, b + .22, sill - .04, sill + .87, .5, 'X_balus')
        return None
    ys = sill + h - rise
    H = hole(a, b, sill, ys, rise, 8 if rise else 1)
    reveal(H, z, d, head_from=(z - .2 if (vous and not far()) else None))
    infill(H, z - d, glass)
    if not far():
        if sill_slab:
            pbox(nm('sill'), a - .14, b + .14, sill - .12, sill, z, z + .13, 'Pale', lean='front_top')
        if vous:
            voussoirs(H, vous, z + .05, z - .2, n=n)
        elif lintel:
            pbox(nm('lin'), a - .2, b + .2, ys, ys + .28, z - .05, z + .06, lintel, lean='front')
        if frame and d0():
            pbox(nm('fr'), a - .12, a, sill, ys, z, z + .05, 'Pale')
            pbox(nm('fr'), b, b + .12, sill, ys, z, z + .05, 'Pale')
        if grille and d0():
            for k in range(1, 4):
                x = a + (b - a) * k / 4
                box(nm('gr'), x - .018, x + .018, sill, ys, z - d * .5 - .02, z - d * .5 + .02, 'S_iron')
            box(nm('grh'), a, b, sill + (ys - sill) * .5 - .018, sill + (ys - sill) * .5 + .018, z - d * .5 - .02, z - d * .5 + .02, 'S_iron')
            # A-7 (the look review: "iron window bars float with no frame"): the grille's own
            # flat iron frame, set into the reveal, the bars leaded into it
            zg0, zg1 = z - d * .5 - .03, z - d * .5 + .03
            box(nm('grf'), a, b, sill, sill + .05, zg0, zg1, 'S_iron'); box(nm('grf'), a, b, ys - .05, ys, zg0, zg1, 'S_iron')
            box(nm('grf'), a, a + .05, sill, ys, zg0, zg1, 'S_iron'); box(nm('grf'), b - .05, b, sill, ys, zg0, zg1, 'S_iron')
        if balconette and d0():
            box(nm('bcs'), a - .25, b + .25, sill - .16, sill - .04, z - .05, z + .55, 'Pale')
            for x in (a - .1, b + .1):
                prism(nm('bcc'), [(0, sill - .16), (.5, sill - .16), (.1, sill - .5), (0, sill - .55)], x - .07, x + .07, 'Pale', axis='x')
            box(nm('bcr'), a - .22, b + .22, sill + .82, sill + .87, z + .45, z + .52, 'S_iron')
            palings(a - .22, b + .22, sill - .04, sill + .82, z + .47, int((b - a + .44) / .14), .024, 'S_iron', d=.03, sides=False)
    if shutters:
        mount('shutters', cx, sill, z, axes=[w / 1.0, h / 2.0, 1])
    return H


def door(cx, w=DOOR_W, floor=1.2, h=DOOR_H, rise=.4, z=0.0, recess=1.4, vous=.34, n=9, leaf=True,
         surfs=('Pale', 'Basalt'), steps=True, fan=True, open_=False, sill=None):
    """A deep doorway: the opening runs from the street to the arch; 4 risers of 0.3 climb
    INSIDE the reveal (ruling 6: "a short doorstep", no flight across the street) to the
    door at the floor; a fanlight in the arch. The door leaf (a joinery tint pool) is a
    mount at the back of the recess; an enterable house leaves it off."""
    a, b = cx - w / 2, cx + w / 2
    ys = floor + h
    H = hole(a, b, 0.0 if steps else floor, ys, rise, 10)
    # sill: a doorway onto a deck that IS its floor (the inn) has none (it z-fought the deck)
    reveal(H, z, recess, 'PaleS', head_from=None if far() else z - .22, sill=(not steps) if sill is None else sill)
    voussoirs(H, vous, z + .06, z - .22, n=n, surfs=surfs)
    zb = z - recess
    if steps and floor > .05:
        nst = 1 if far() else max(1, int(round(floor / .3)))
        td = (recess - .2) / nst
        for k in range(nst):
            # each step a block from its own riser back to the door: the top one is the
            # landing in front of the leaf (LOD1: one block, its face and tread)
            y0 = -POD if k == 0 else k * floor / nst
            pbox(nm('stp'), a, b, y0, (k + 1) * floor / nst, zb, z - k * td + (.02 if k == 0 else 0), 'Pale', lean='front_top' if far() else None) if far() else \
                box(nm('stp'), a, b, y0, (k + 1) * floor / nst, zb, z - k * td + (.02 if k == 0 else 0), 'Pale')
    # the door's frame plane: lintel under the fanlight, the fanlight in the arch
    if fan and rise > 0:
        Hf = hole(a, b, ys, ys, rise, 10)
        if not far():
            box(nm('dlin'), a, b, ys - .02, ys + .1, zb - .02, zb + .12, 'Timber')
        infill_above(Hf, ys + (0 if far() else .1), zb, 'GlassSq')
    if open_:
        pass                       # an enterable civic doorway: always open
    elif leaf:
        mount('door', cx, floor, zb + .04, axes=[w / DOOR_W, h / DOOR_H, 1])
    else:
        infill(dict(hole(a, b, floor, ys, 0, 1)), zb, 'R_door_oak')
    return H


def lamp_niche(cx, y0, w=.5, h=.8, z=0.0):
    """An arched niche with a lamp burning in it -- lit at night through the facade's
    emissive (the 'lit' swatch is on MC_Glass), so it needs no pool and no point light."""
    if far(): return None                 # LOD1: the niche is painted out (its lamp is the night's)
    Hn = hole(cx - w / 2, cx + w / 2, y0, y0 + h - w / 2, w / 2, 8)
    reveal(Hn, z, .28, 'PaleS')
    infill(Hn, z - .28, 'S_shade')
    if not far():
        box(nm('nlamp'), cx - .08, cx + .08, y0 + .02, y0 + .3, z - .24, z - .1, 'S_lit')
        box(nm('nsill'), cx - w / 2 - .1, cx + w / 2 + .1, y0 - .1, y0, z - .05, z + .1, 'Pale')
    return Hn


def plaque(cx, cy, s=.62, z=.0):
    """A glazed tile plaque (the academy's ring and stars) in a pale frame."""
    if far(): return
    pbox(nm('plqf'), cx - s / 2 - .07, cx + s / 2 + .07, cy - s / 2 - .07, cy + s / 2 + .07, z, z + .04, 'Pale', lean='front_top')
    quad(nm('plq'), [(cx - s / 2, cy - s / 2, z + .045), (cx + s / 2, cy - s / 2, z + .045), (cx + s / 2, cy + s / 2, z + .045), (cx - s / 2, cy + s / 2, z + .045)],
         'R_plaque', (0, 0, 1))


# ====================================================================== the house ranks
# Heights (MOONMERE.md section 5, "Datums"): every number relative to the rank's ground.
#   ct  plinth 1.2 | storey 1.2-4.8 | storey 4.8-8.4 | loggia storey 8.4-11.6 (eave)
#   st  plinth 1.2 | 1.2-4.8 | 4.8-8.4 | 8.4-12.0 (eave)
#   hl  plinth 0.6 | 0.6-4.2 | 4.2-7.8 | 7.8-11.4 (eave)
#   cy  the front rank's court face, lime-rendered, 0-11.6;  rs  the riser rank's, 0-7.2
#   cl  arcade 0-3.9 + a storey over it, eave 7.2, 4.0 deep;  wr  3.6 + loft 2.6, eave 6.2
def palings(x0, x1, y0, y1, z, n, w, surf, d=.04, sides=True, skip=()):
    """A row of n thin uprights (slats, balusters, iron bars) from x0 to x1 as ONE mesh: each
    a front face, and at DET 0 its two sides; their backs and ends are never seen."""
    vs, fs, ns = [], [], []
    for k in range(n):
        x = x0 + (x1 - x0) * (k + .5) / n
        if any(abs(x - s_) < .2 for s_ in skip): continue
        q = len(vs)
        vs += [(x - w / 2, y0, z + d), (x + w / 2, y0, z + d), (x + w / 2, y1, z + d), (x - w / 2, y1, z + d)]
        fs.append((q, q + 1, q + 2, q + 3)); ns.append(Vector((0, 0, 1)))
        if sides and False:
            for sx in (-1, 1):
                xx = x + sx * w / 2; q = len(vs)
                vs += [(xx, y0, z), (xx, y0, z + d), (xx, y1, z + d), (xx, y1, z)]
                fs.append((q, q + 1, q + 2, q + 3) if sx > 0 else (q + 3, q + 2, q + 1, q)); ns.append(Vector((sx, 0, 0)))
    if fs: mesh(nm('pal'), vs, fs, surf, normals2=ns)


def gallery_storey(y0, E, depth=1.6, x0=-2.0, x1=2.0, surf_back='TufaS', glass='GlassLoggia', posts=(-2.0, 0.0), lean_joists=False):
    """An open timber gallery under the eave (the court house's loggia storey, and the
    court faces' top galleries): posts and bolsters, a slatted rail, french windows in the
    back wall, a beamed ceiling. LOD1 keeps the recess, the posts and a painted rail."""
    zb = -depth
    if far():
        # LOD1: the back wall whole, its french windows painted on
        wall(x0, x1, y0, E, surf_back, z=zb)
        for xa in (-1.5, .5):
            quad(nm('lgw'), [(xa, y0 + .05, zb + .01), (xa + 1, y0 + .05, zb + .01), (xa + 1, y0 + 2.35, zb + .01), (xa, y0 + 2.35, zb + .01)], glass, (0, 0, 1))
    else:
        hs = [hole(-1.5, -.5, y0 + .05, y0 + 2.35, 0, 1), hole(.5, 1.5, y0 + .05, y0 + 2.35, 0, 1)]
        wall(x0, x1, y0, E, surf_back, hs, z=zb)
        for H in hs:
            reveal(H, zb, .12, 'PaleS', sill=False)
            infill(H, zb - .12, glass)
    quad(nm('lfl'), [(x0, y0, 0), (x1, y0, 0), (x1, y0, zb), (x0, y0, zb)], 'Pale', (0, 1, 0))
    quad(nm('lce'), [(x0, E - .3, .12), (x1, E - .3, .12), (x1, E - .3, zb), (x0, E - .3, zb)], 'TimberD', (0, -1, 0))
    pbox(nm('lbeam'), x0, x1, E - .32, E, -.12, .12, 'Timber', lean='front' if far() else None)
    pbox(nm('ledge'), x0, x1, y0 - .2, y0, 0, .26, 'Pale', lean='front_top' if far() else None)   # from 0: its top never under the floor
    for px in posts:
        pbox(nm('post'), px - .12, px + .12, y0, E - .32, -.12, .12, 'Timber', lean='front' if far() else None)
        if not far():
            box(nm('bol'), px - .36, px + .36, E - .5, E - .32, -.15, .15, 'Timber')
    if far():
        for xa, xb in ((x0 + .12, -.12), (.12, x1 - .12)):
            card(nm('bal'), xa, xb, y0, y0 + 1.0, .02, 'X_balus', back=True)
        return
    box(nm('rail'), x0, x1, y0 + .92, y0 + 1.02, -.05, .07, 'Timber')
    box(nm('rail'), x0, x1, y0 + .04, y0 + .12, -.04, .06, 'Timber')
    if d0():
        palings(x0, x1, y0 + .12, y0 + .92, -.02, 16, .06, 'Timber', skip=posts)
        for jx in (-1.33, 0.0, 1.33):
            if lean_joists:      # the court face: its 60 KB (MOONMERE.md "Ceilings")
                pbox(nm('joist'), jx - .06, jx + .06, E - .48, E - .3, zb, .1, 'S_hull', keep=(0, 1, 2, 4))
            else:
                pbox(nm('joist'), jx - .06, jx + .06, E - .48, E - .3, zb, .1, 'Timber')
    else:
        card(nm('bal'), x0 + .1, x1 - .1, y0 + .12, y0 + .92, .0, 'X_balus')
    mount('planter', 1.0, y0 + .04, -.5, kind2='gallery')


def inner_face(y0, y1, holes, z, surf='LimeS'):
    """The ground storey's INSIDE face on a door bay (facing into the house), so a house
    entered through this bay (home_in, oh_in_*, shop_in sit with their middle 4 m behind
    the door bay) is closed: every other wall is lined by the interior itself."""
    wall(-2, 2, y0, y1, surf, holes, z=z, facing=-1)


def court_mouth(Hg, E, zc=-D, windows=True):
    """The far end of a gate or loggia passage, seen from the court: the arch again, its
    banded voussoirs, and the lime-rendered court face of this bay round it (a gate or
    loggia bay carries its own court face: place NO bay_cy_win behind it)."""
    with G.at(z=zc):
        with G.at(M=RY(math.pi)):
            wall(-2, 2, -POD, .3, 'Basalt', [Hg])
            wall(-2, 2, .3, 4.8, 'Lime', [Hg])
            voussoirs(Hg, .4, .06, -.25, n=11)
            hs = [window(0, 5.5, .9, 1.7, 'GlassTallD', lintel='Pale', shutters=True)] if windows else []
            wall(-2, 2, 4.8, 8.4, 'Lime', hs)
            band(4.74, .12); band(8.34, .12)
            hs3 = [window(0, 9.0, .8, 1.3, 'GlassSq', lintel='Pale')] if windows else []
            wall(-2, 2, 8.4, E, 'Lime', hs3)
            pbox(nm('cplate'), -2, 2, E - .3, E, -.1, .1, 'Timber', lean='front' if far() else None)


def passage(a, b, top_y, depth=D, floor_y=0.0, surf='LimeS', gutter=True, inset=0.0, inset_far=0.0):
    """A through-passage (gate or loggia) 9 m deep: its walls, its vault (the arch swept
    along), its floor and a basalt gutter. inset / inset_far: where banded jamb blocks
    already line the passage's mouths (their inner faces ARE the wall there), the passage's
    own walls start behind them -- never both (review: coplanar jambs and walls z-fought),
    and never neither (the wall's thickness stood open at an unjambed mouth)."""
    z0, z1 = -inset, -depth + inset_far
    quad(nm('pw'), [(a, floor_y, z0), (a, floor_y, z1), (a, top_y, z1), (a, top_y, z0)], surf, (1, 0, 0))
    quad(nm('pw'), [(b, floor_y, z0), (b, floor_y, z1), (b, top_y, z1), (b, top_y, z0)], surf, (-1, 0, 0))
    quad(nm('pf'), [(a, floor_y + .02, 0), (b, floor_y + .02, 0), (b, floor_y + .02, -depth), (a, floor_y + .02, -depth)], 'Pale', (0, 1, 0))
    if gutter and d0():
        box(nm('pg'), -.15, .15, floor_y, floor_y + .045, -depth, 0, 'Basalt')


def ct(back):
    """The court house's street face (MM-1: a blank-ish, high-windowed street wall, the
    court behind it) -- but never blank at eye level (MM-0): every ground storey has a
    bench in the plinth, a grilled window pair, a tile plaque, a lamp, a door, a shop or an
    arcade into the court."""
    E = EAVE['ct']; PL = PLINTH['ct']
    gaps, h1, h2 = [], [], []
    inner = None
    if back == 'win':
        for x in (-1.05, 1.05):
            h1.append(window(x, 2.9, .8, 1.0, 'GlassHigh', d=.35, lintel='Basalt', sill_slab=False, grille=True))
        # LOOK PASS M2: the plaque and the plinth bench are MOUNTS now (per-bay variety: the
        # planner picks a variant or nothing), not baked into every ct window bay
        mount('plaque', 0, 3.25, 0, axes=[.56 / .6, .56 / .6, 1])
        for x in (-.92, .92): mount('bench', x, 0, .2, axes=[1.6 / 1.8, 1, 1])
        mount('lamp', 0, 4.0, 0)
        mount('vine', -1.9, 0, .05)
        h2.append(window(0, 5.45, 1.0, 2.0, 'GlassTall', rise=.25, vous=.3, shutters=True, balconette=True))
    elif back == 'door':
        Hd = door(0)
        gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
        h1.append(window(-1.45, 2.9, .5, 1.0, 'GlassHigh', d=.3, lintel='Basalt', sill_slab=False, grille=True))
        bench(1.0, 1.9)
        mount('lamp', 1.4, 3.8, 0)
        inner = (PL, 4.8, [hole(-.7, .7, PL, PL + DOOR_H, 0, 1)], -1.4)
        h2.append(window(0, 5.45, 1.0, 2.0, 'GlassTallD', lintel='Basalt', shutters=True))
    elif back in ('gate', 'loggia'):
        a, b = -GATE_W / 2, GATE_W / 2
        Hg = hole(a, b, 0.0, GATE_H - .8, .8, 12)
        gaps.append((a - .02, b + .02)); h1.append(Hg)
        passage(a, b, GATE_H - .8, inset=.6 if (back == 'gate' and not far()) else 0.0)
        # the vault between the street voussoirs (to -0.6) and the court mouth's (from -D + 0.25)
        reveal(dict(Hg, c=GATE_H - .8), 0, D, 'LimeS', jambs=False, sill=False,
               head_from=0 if far() else (-.6 if back == 'gate' else -.3),
               head_to=-D if far() else -D + .25)
        if back == 'gate':
            voussoirs(Hg, .56, .1, -.6, n=13)
            if not far():
                # banded jambs, then the oak leaves standing open into the passage
                y = 0.0; i = 0
                while y < GATE_H - .8 - 1e-6:
                    hgt = min(.45, GATE_H - .8 - y)
                    for s_ in (-1, 1):
                        w_ = .42 if i % 2 == 0 else .3
                        xa, xb = (a - w_, a) if s_ < 0 else (b, b + w_)
                        pbox(nm('jb'), xa, xb, y, y + hgt, -.6, .1, 'Pale' if i % 2 == 0 else 'Basalt')
                    y += hgt; i += 1
                if d0():
                    for s_ in (-1, 1):
                        hx = a + .1 if s_ < 0 else b - .1
                        with G.at(M=T(hx, 0, -.75) @ RY(-s_ * math.radians(80))):
                            x0, x1 = (0, 1.5) if s_ < 0 else (-1.5, 0)
                            box(nm('leaf'), x0, x1, .05, GATE_H - .3, -.05, .05, 'R_door_oak')
            for s_ in (-1, 1):
                mount('lamp', s_ * GATE_W / 2 * .99, 2.9, -3.0, yaw=-s_ * math.pi / 2, inside=True)
        else:
            # MOONMERE.md: ct_loggia opens the court to the street through three stilted
            # banded arches on octagonal columns; inside, a vaulted walk with benches
            infill_arcade(a, b, GATE_H - .8)
            if d0():
                for s_ in (-1, 1):
                    box(nm('lbench'), s_ * (GATE_W / 2 - .45) - .2, s_ * (GATE_W / 2 - .45) + .2, .42, .5, -D + 1.5, -1.5, 'Pale')
            mount('lamp', 0, GATE_H - .9, -D / 2, hang=True)
        court_mouth(Hg, E)
        mount('plaque', 0, 5.45, 0)
        h2.append(window(0, 6.3, .9, 1.4, 'GlassSq', lintel='Basalt'))
    elif back == 'shop':
        Hs = hole(-1.6, 1.6, 0.0, 3.1, .5, 12)
        gaps.append((-1.62, 1.62)); h1.append(Hs)
        shopfront(Hs, 1.6)
        h2.append(window(-.95, 5.45, .9, 1.9, 'GlassTall', lintel='Basalt', shutters=True))
        h2.append(window(.95, 5.45, .9, 1.9, 'GlassTallD', lintel='Basalt', shutters=True))
        inner = (0.0, 4.8, [hole(-1.55, -.35, 0, 2.8, 0, 1)], -.6)
    plinth(gaps=gaps)
    wall(-2, 2, PL, 4.8, 'Tufa', h1)
    rule(4.8, holes=h2)
    wall(-2, 2, 4.8, 8.4, 'Tufa', h2)
    band(8.3, .2)
    gallery_storey(8.4, E)
    if inner:
        inner_face(inner[0], inner[1], inner[2], inner[3])


def infill_arcade(a, b, spring, t=.3):
    """Three stilted banded arches on two octagonal columns, filling an opening a..b whose
    own arch springs at `spring`: the loggia's street front. The arcade is a 0.3 m screen with
    BOTH faces (the walk inside sees its back), and the small arches spring low enough that
    their voussoirs stay under the big arch's springing (review 2026-10-06: their heads rose
    into the tympanum and the sky showed through above them)."""
    cols = (-GATE_W / 6, GATE_W / 6)
    r = .17
    spans = [(a, cols[0] - r), (cols[0] + r, cols[1] - r), (cols[1] + r, b)]
    rises = [(xb - xa) / 2 * .9 for xa, xb in spans]
    ys = spring - max(rises) - .26
    for x in cols:
        if far():
            box(nm('col'), x - r, x + r, 0, ys, -.3, .1, 'Pale')
            continue
        lathe(nm('col'), [(r * 1.4, 0, True), (r * 1.4, .3, True), (r, .36, True), (r * .92, ys - .32, True), (r * 1.3, ys - .2, True),
                          (r * 1.3, ys, True)], 'Pale', seg=8, cx=x, cz=-.1, caps=False, smooth=False, phase=math.pi / 8)
    hs = []
    for (xa, xb), rr in zip(spans, rises):
        Ha = hole(xa, xb, ys, ys, rr, 8)
        hs.append(Ha)
        reveal(Ha, 0, t, 'PaleS', sill=False, jambs=False, head=far())
        voussoirs(Ha, .2, .04, -t, n=7)
    # the spandrels up to the big arch's springing, then the tympanum under it: front and back
    wall(a, b, ys, spring, 'Tufa', hs)
    Hbig = hole(a, b, spring, spring, .8, 12)
    infill(dict(Hbig, c=spring), 0, 'Tufa')
    if not far():
        wall(a, b, ys, spring, 'TufaS', hs, z=-t, facing=-1)
        infill(dict(Hbig, c=spring), -t, 'TufaS', facing=-1)
        box(nm('tymb'), a, b, spring - .02, spring + .12, -t - .05, .05, 'Basalt')


def shopfront(Hs, half):
    """An arched shopfront at street level (MOONMERE.md: shop bays open at street level): a
    door on the left (an enterable shop's way in; a door_leaf mount otherwise), the shop
    window over a timber stall on the right, goods on the shelves behind the glass, a
    sign bracket and a pentice over the stall (planDressing's mounts)."""
    a, b = Hs['a'], Hs['b']
    reveal(Hs, 0, .5, 'PaleS', head_from=None if far() else -.2)
    voussoirs(Hs, .38, .08, -.2, n=11)
    mull = -.35
    # the door part: open to the inside (floor at the street), leaf as a mount
    mount('door', (a + mull) / 2, 0, -.46, axes=[(mull - a - .05) / DOOR_W, 2.8 / DOOR_H, 1], shop=True)
    # the window part: goods behind glass over the stall, the arch head glazed over all
    infill(dict(hole(mull + .1, b, 1.0, Hs['ys'], 0, 1)), -.5, 'GlassShop')
    Hh = hole(a, b, Hs['ys'], Hs['ys'], Hs['rise'], 12)
    infill_above(Hh, Hs['ys'] + .02, -.5, 'GlassSq')
    box(nm('transom'), a, b, Hs['ys'] - .04, Hs['ys'] + .08, -.52, -.38, 'Timber')
    box(nm('mull'), mull - .05, mull + .1, 0, Hs['ys'], -.52, -.38, 'Timber')
    if far():
        pbox(nm('stall'), mull + .1, b, 0, 1.02, -.5, .3, 'Timber', lean='front_top')
    else:
        box(nm('stall'), mull + .1, b, 0, .95, -.5, .42, 'Timber')
        box(nm('stalltop'), mull + .05, b + .05, .95, 1.02, -.5, .48, 'Pale')
    if d0():
        for k in range(3):
            x = mull + .3 + k * (b - mull - .4) / 2.0
            box(nm('crate'), x - .14, x + .14, 1.02, 1.24, .02, .36, 'S_oak')
            box(nm('fruit'), x - .11, x + .11, 1.24, 1.3, .05, .33, 'S_lemon' if k != 1 else 'S_red')
    mount('sign', b + .25, 3.95, .05, yaw=0.0)
    mount('pentice', (mull + b) / 2, Hs['ys'] - .1, .0, axes=[(b - mull) / 2.0, 1, 1])


def st(back):
    """The street house (Landing Row, outer rows, the Scriveners' Row): three storeys, the
    ruled wall, a balcony, a gallery or an oriel; benches, lamp niches, shops at eye level."""
    E = EAVE['st']; PL = PLINTH['st']
    gaps, h1, h2, h3 = [], [], [], []
    inner = None
    if back == 'win':
        for x in (-1.0, 1.0):
            h1.append(window(x, 2.8, .75, 1.0, 'GlassHigh', d=.35, lintel='Basalt', sill_slab=False, grille=True))
        h1.append(lamp_niche(0, 2.75))
        for x in (-.95, .95): mount('bench', x, 0, .2, axes=[1.6 / 1.8, 1, 1])
        mount('vine', 1.9, 0, .05)
        for x in (-.95, .95):
            h2.append(window(x, 5.45, .9, 1.9, 'GlassTallD' if x < 0 else 'GlassTall', rise=.2, vous=.24, shutters=True))
            h3.append(window(x, 9.15, .85, 1.3, 'GlassSq', lintel='Basalt'))
        hanging_gallery(5.15)
    elif back == 'door':
        Hd = door(0)
        gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
        h1.append(window(-1.45, 2.8, .5, 1.0, 'GlassHigh', d=.3, lintel='Basalt', sill_slab=False, grille=True))
        mount('lamp', 1.4, 3.8, 0)
        mount('planter', 1.3, 0, .55, kind2='step')
        bench(1.0, 1.9)
        mount('plaque', -1.45, 4.2, 0, axes=[.4 / .6, .4 / .6, 1])
        inner = (PL, 4.8, [hole(-.7, .7, PL, PL + DOOR_H, 0, 1)], -1.4)
        h2.append(window(0, 5.45, 1.0, 2.0, 'GlassTall', lintel='Basalt', shutters=True))
        stone_balcony(0, 5.3)
        h3.append(window(0, 9.15, .9, 1.3, 'GlassSq', lintel='Basalt'))
    elif back == 'shop':
        Hs = hole(-1.6, 1.6, 0.0, 3.1, .5, 12)
        gaps.append((-1.62, 1.62)); h1.append(Hs)
        shopfront(Hs, 1.6)
        inner = (0.0, 4.8, [hole(-1.55, -.35, 0, 2.8, 0, 1)], -.6)
        for x in (-.95, .95):
            h2.append(window(x, 5.45, .9, 1.9, 'GlassTall' if x < 0 else 'GlassTallD', lintel='Basalt', shutters=True))
            h3.append(window(x, 9.15, .85, 1.3, 'GlassSq', lintel='Basalt'))
    elif back == 'oriel':
        for x in (-1.0, 1.0):
            h1.append(window(x, 2.8, .75, 1.0, 'GlassHigh', d=.35, lintel='Basalt', sill_slab=False, grille=True))
        h1.append(lamp_niche(0, 2.75))
        for x in (-.85, .85): mount('bench', x, 0, .2, axes=[1.5 / 1.8, 1, 1])
        mount('vine', -1.9, 0, .05)
        h2.append(oriel(5.0))
        for x in (-.95, .95):
            h3.append(window(x, 9.15, .85, 1.3, 'GlassSq', lintel='Basalt'))
    plinth(gaps=gaps)
    wall(-2, 2, PL, 4.8, 'Tufa', h1)
    rule(4.8, holes=h2)
    wall(-2, 2, 4.8, 8.4, 'Tufa', h2)
    rule(8.4, holes=h3)
    wall(-2, 2, 8.4, E - .3, 'Tufa', h3)
    pbox(nm('plate'), -2, 2, E - .3, E, -.1, .1, 'Timber', lean='front' if far() else None)
    if inner:
        inner_face(inner[0], inner[1], inner[2], inner[3])


def hanging_gallery(y):
    """A timber gallery hung across the bay on brackets (the street house's first floor)."""
    box(nm('gfl'), -2, 2, y - .16, y, -.05, .82, 'Timber')
    if far():
        card(nm('gbal'), -2, 2, y, y + .95, .82, 'X_balus', back=True)
        return
    for x in (-1.5, 0, 1.5):
        prism(nm('gbr'), [(0, y - .16), (.8, y - .16), (.8, y - .26), (.25, y - .66), (0, y - .76)], x - .07, x + .07, 'Timber', axis='x')
    box(nm('grail'), -2, 2, y + .85, y + .95, .72, .82, 'Timber')
    if d0():
        palings(-2, 2, y, y + .85, .74, 16, .06, 'Timber')
    else:
        card(nm('gbal'), -2, 2, y, y + .85, .79, 'X_balus')
    mount('planter', -1.0, y, .45, kind2='gallery')


def stone_balcony(cx, y):
    if far():
        pbox(nm('bal'), cx - .9, cx + .9, y - .05, y + .12, -.05, .72, 'Pale', lean='front_top')
        return
    box(nm('bal'), cx - .9, cx + .9, y - .05, y + .12, -.05, .75, 'Pale')
    for s in (-1, 1):
        prism(nm('corb'), [(0, y - .05), (.62, y - .05), (.55, y - .3), (.2, y - .55), (0, y - .65)], cx + .55 * s - .1, cx + .55 * s + .1, 'Pale', axis='x')
    box(nm('ir'), cx - .88, cx + .88, y + .98, y + 1.03, .66, .72, 'S_iron')
    if d0():
        palings(cx - .9, cx + .9, y + .12, y + 1.0, .67, 9, .03, 'S_iron', sides=False)
        for s in (-1, 1):
            box(nm('ir'), cx + s * .86 - .025, cx + s * .86 + .025, y + .12, y + 1.03, -.02, .72, 'S_iron')


def oriel(y0):
    """A timber oriel on the first floor (MOONMERE.md: st_oriel): a glazed box 2.4 wide
    projecting 0.8 on brackets, three leaded lights and two side lights under a small
    tiled hood. Returns the hole it fills in the wall."""
    a, b = -1.2, 1.2; dz = .8; h = 2.5; y1 = y0 + h
    H = hole(a + .1, b - .1, y0 + .3, y1 - .3, 0, 1)
    infill(H, -.1, 'S_shade')
    box(nm('obase'), a, b, y0 - .1, y0 + .3, 0, dz + .05, 'Timber')
    box(nm('otop'), a, b, y1 - .3, y1, 0, dz + .05, 'Timber')
    quad(nm('ofr'), [(a, y0 + .3, dz), (b, y0 + .3, dz), (b, y1 - .3, dz), (a, y1 - .3, dz)], 'GlassOriel', (0, 0, 1))
    for xs, sg in ((a, -1), (b, 1)):
        quad(nm('osd'), [(xs, y0 + .3, 0), (xs, y0 + .3, dz), (xs, y1 - .3, dz), (xs, y1 - .3, 0)], 'GlassOriel', (sg, 0, 0))
    quad(nm('ohood'), [(a - .15, y1, dz + .25), (b + .15, y1, dz + .25), (b + .15, y1 + .45, -.05), (a - .15, y1 + .45, -.05)], 'Pantile', (0, 1, 1))
    for xs, sg in ((a - .15, -1), (b + .15, 1)):
        # the hood's cheek: a triangle (its fourth corner crossed back over the third: inside out)
        mesh(nm('ohs'), [(xs, y1, 0), (xs, y1, dz + .25), (xs, y1 + .45, -.05)], [(0, 1, 2)], 'Timber', facing=(sg, 0, 0))
    if not far():
        for x in (-.4, .4):
            box(nm('omu'), x - .05, x + .05, y0 + .3, y1 - .3, dz - .02, dz + .06, 'Timber')
        for x in (a + .3, b - .3):
            prism(nm('obr'), [(0, y0 - .1), (dz, y0 - .1), (dz, y0 - .2), (.2, y0 - .9), (0, y0 - 1.0)], x - .08, x + .08, 'Timber', axis='x')
    mount('planter', 0, y0 + .3, dz + .2, kind2='sill')
    return hole(a, b, y0 - .1, y1, 0, 1)


def hl(back):
    """The hall (the Crown only): honey-ochre tufa in WIDE bands, tall windows through two
    storeys under banded heads, pale pilaster strips at the joints."""
    E = EAVE['hl']; PL = PLINTH['hl']
    gaps, h1, h2 = [], [], []
    inner = None
    if back == 'win':
        h1.append(window(0, 1.9, 1.4, 4.4, 'GlassHall', rise=.5, vous=.42, n=11, d=.42, frame=True))
        bench(-1.7, -.95); bench(.95, 1.7)
    else:
        Hd = door(0, w=1.8, floor=PL, h=3.4, rise=.6, recess=1.0, vous=.48, n=11)
        gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
        for s in (-1, 1): mount('lamp', s * 1.45, 3.9, 0)
        inner = (PL, 6.9, [hole(-.9, .9, PL, PL + 3.4, 0, 1)], -1.0)
    h2.append(window(0, 8.1, 1.2, 2.3, 'GlassTall', rise=.3, vous=.34, n=9, frame=True))
    plinth(top=PL, gaps=gaps)
    wall(-2, 2, PL, 6.9, 'Tufa', h1)
    band(6.9, .5)                                     # the hall's WIDE band
    wall(-2, 2, 7.4, E - .3, 'Tufa', h2)
    pbox(nm('plate'), -2, 2, E - .3, E, -.1, .12, 'Timber', lean='front' if far() else None)
    if not far():
        for x, s in ((-2, 1), (2, -1)):
            xa, xb = (x, x + .3) if s > 0 else (x - .3, x)
            box(nm('pil'), xa, xb, PL, 6.9, -.02, .1, 'Pale')
            pbox(nm('pil'), xa, xb, 7.4, E - .3, -.02, .1, 'Pale', lean='front')
    if back == 'door':
        mount('plaque', 0, 6.35, 0, axes=[.5 / .6, .5 / .6, 1])
    if inner:
        inner_face(inner[0], inner[1], inner[2], inner[3])


def cy(back='win'):
    """A front rank's COURT face (placed turned pi at the back wall): lime render with tufa
    dressings, bright (MOONMERE.md: the courts read bright); a garden door up a stoop, a
    balcony, and an open gallery under the eave -- the courts' loggias."""
    E = EAVE['cy']
    h1, h2 = [], []
    Hd = hole(-.55, .55, 1.2, 3.3, .3, 8)
    h1.append(Hd)
    reveal(Hd, 0, .35, 'PaleS', head_from=None if far() else -.15)
    infill(dict(Hd, c=1.2), -.35, 'GlassLoggia')
    voussoirs(Hd, .26, .05, -.15, n=7, surfs=('Pale', 'Tufa'))
    # the stoop into the court: four risers of 0.3. LOOK PASS M2 (2026-10-06: the pale blocks
    # "read as stacked stone" beside the court windows): grey basalt (piperno) treads between
    # two lime cheek walls with a pale coping that follows the nosing line, so it reads as a
    # stair and not as a pile of ashlar
    if far():
        pbox(nm('cst'), -.68, .68, -POD, 1.2, -.02, .8, 'BasaltS', lean='front_top')
    else:
        # the flight as ONE sawtooth (risers and treads, basalt) under a pale nosing strip a step
        prof = [(1.0 - k * .25, y) for k in range(4) for y in (k * .3, (k + 1) * .3)]
        vs = [(x, y, z) for x in (-.6, .6) for z, y in [(1.0, -POD)] + prof]
        n_ = len(prof) + 1
        fs = [(i, i + 1, n_ + i + 1, n_ + i) for i in range(n_ - 1)]
        # basalt risers, pale worn treads: the flight reads by its nosing lines, no extra boxes
        mesh(nm('cst'), vs, [f for i, f in enumerate(fs) if i % 2 == 0], 'Basalt', normals2=[Vector((0, 0, 1))] * 4)
        mesh(nm('cst'), vs, [f for i, f in enumerate(fs) if i % 2 == 1], 'S_pale_s', normals2=[Vector((0, 1, 0))] * 4, tint=.92)
        # iteration 2 (2026-10-06): the lime cheek walls read as a row of pale wedges down every
        # court face -- the flight now shows its own stepped basalt side and an iron handrail
        stp = [(1.0, -POD), (1.0, .3), (.75, .3), (.75, .6), (.5, .6), (.5, .9), (.25, .9), (.25, 1.2), (-.02, 1.2), (-.02, -POD)]
        for x, f in ((-.6, -1), (.6, 1)):
            mesh(nm('csd'), [(x, y, z) for z, y in stp], [tuple(range(len(stp)))], 'S_blue', facing=(f, 0, 0), tint=1.12)   # a swatch: one polygon, no tile cuts
            if d0():
                # the rail and its two posts as thin flat bars (their outer face and their front)
                xo = x + f * .02
                for (pz, py) in ((.88, .3), (.13, 1.2)):
                    quad(nm('crp'), [(xo, py, pz - .02), (xo, py, pz + .02), (xo, py + .92, pz + .02), (xo, py + .92, pz - .02)], 'S_iron', (f, 0, 0))
                    quad(nm('crp'), [(x - .02, py, pz + .02), (x + .02, py, pz + .02), (x + .02, py + .92, pz + .02), (x - .02, py + .92, pz + .02)], 'S_iron', (0, 0, 1))
                quad(nm('crr'), [(xo, 1.16, .95), (xo, 2.24, .05), (xo, 2.28, .05), (xo, 1.2, .95)], 'S_iron', (f, 0, 0))
                quad(nm('crr'), [(x - .025, 1.2, .95), (x + .025, 1.2, .95), (x + .025, 2.28, .05), (x - .025, 2.28, .05)], 'S_iron', (0, 1, .83))
    h1.append(window(1.35, 2.2, .55, 1.1, 'GlassSq', d=.25, lintel='Pale', sill_slab=True))
    mount('lamp', -1.3, 3.4, 0); mount('planter', -1.4, 0, .5, kind2='ground'); mount('vine', 1.95, 0, .05)
    for x in (-.95, .95):
        h2.append(window(x, 5.45, .85, 1.8, 'GlassTall' if x > 0 else 'GlassTallD', lintel='Pale', shutters=True))
    if not far():
        box(nm('cbal'), -1.6, 1.6, 5.3, 5.42, -.05, .6, 'Timber')
        box(nm('cbr'), -1.6, 1.6, 6.3, 6.38, .52, .6, 'Timber')
        if d0():
            palings(-1.6, 1.6, 5.42, 6.3, .54, 13, .05, 'Timber')
            for x in (-1.3, 1.3):
                # the bracket's faces that show (its top is under the balcony, its back on the wall)
                pp = [(0, 5.3), (.55, 5.3), (.55, 5.22), (.15, 4.95), (0, 4.9)]
                vs_ = [(xx, y, z) for xx in (x - .06, x + .06) for z, y in pp]
                mesh(nm('cbb'), vs_, [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5), (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4)], 'Timber',
                     normals2=[Vector((-1, 0, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -.6, 1)).normalized(), Vector((0, -1, .3)).normalized()])
    wall(-2, 2, -POD, .3, 'Basalt')
    wall(-2, 2, .3, 4.8, 'Lime', h1)
    band(4.74, .12)
    wall(-2, 2, 4.8, 8.4, 'Lime', h2)
    band(8.34, .12)
    gallery_storey(8.4, E, depth=1.2, surf_back='LimeS', glass='GlassTallD', lean_joists=True)
    if not far():
        for x, s in ((-2, 1), (2, -1)):
            xa, xb = (x, x + .22) if s > 0 else (x - .22, x)
            y = .3; i = 0
            while y < 8.3:
                if i % 2 == 0: pbox(nm('cq'), xa, xb, y, min(8.3, y + .6), -.02, .06, 'Pale', keep=(4,))   # 6 cm: its face reads
                y += .6; i += 1


def rs(back='win'):
    """The riser rank's court face: two storeys against the riser, its roof the upper
    street's level (MM-6, D-4). Lime render, a workshop arch, an upper gallery."""
    E = EAVE['rs']
    h1, h2 = [], []
    Ha = hole(-1.65, -.15, 0.0, 2.6, .5, 10)
    h1.append(Ha)
    reveal(Ha, 0, .4, 'PaleS', head_from=None if far() else -.2)
    voussoirs(Ha, .3, .05, -.2, n=9, surfs=('Pale', 'Basalt'))
    if far():
        infill(Ha, -.4, 'R_door_oak')
    else:
        # the workshop door: boarded leaves under a glazed fanlight, a step, a bench beside
        infill(dict(hole(-1.65, -.15, 0.0, 2.6, 0, 1)), -.4, 'R_door_oak')
        infill(dict(Ha, c=2.6), -.4, 'GlassSq')
        pbox(nm('wdl'), -1.65, -.15, 2.55, 2.65, -.4, -.3, 'Timber')
        box(nm('wds'), -1.75, -.05, -.3, .14, -.02, .35, 'Pale')
    h1.append(window(1.0, 1.4, .8, 1.5, 'GlassTallD', d=.3, lintel='Pale', shutters=True))
    mount('lamp', .25, 3.0, 0); mount('planter', 1.0, 0, .45, kind2='ground'); mount('vine', 1.95, 0, .05)
    if d0():
        # the court's wall fountain under the window: a pale basin on a basalt foot, a bronze
        # spout from a tile plaque, a trickle (the courts' wells and fountains, MM-1)
        box(nm('fbs'), .35, 1.65, .0, .22, -.02, .5, 'Basalt')
        box(nm('fbn'), .3, 1.7, .22, .6, -.02, .55, 'Pale')
        quad(nm('fwt'), [(.38, .58, .5), (1.62, .58, .5), (1.62, .58, .02), (.38, .58, .02)], 'S_water', (0, 1, 0))
        plaque(1.0, 1.05, .3, z=.0)
        prism(nm('fsp'), [(0, .92), (.22, .9), (.22, .86), (0, .86)], .97, 1.03, 'S_brass_p', axis='x')
        quad(nm('ftr'), [(.99, .6, .2), (1.01, .6, .2), (1.01, .88, .2), (.99, .88, .2)], 'S_water', (0, 0, 1))
        # a trellis for the vine up the joint, timber laths
        palings(1.45, 1.95, .7, 3.4, .04, 3, .05, 'Timber', d=.03, sides=False)
        for y in (1.2, 2.0, 2.8):
            box(nm('tl'), 1.42, 1.98, y, y + .05, .07, .1, 'Timber')
    for x in (-1.0, 1.0):
        h2.append(window(x, 4.4, .8, 1.6, 'GlassTall' if x < 0 else 'GlassSq', lintel='Pale'))
    wall(-2, 2, -POD, .3, 'Basalt', [Ha])
    wall(-2, 2, .3, 3.6, 'Lime', [h_ for h_ in h1])
    band(3.54, .12)
    wall(-2, 2, 3.6, E - .25, 'Lime', h2)
    pbox(nm('rcor'), -2, 2, E - .25, E, -.08, .16, 'Pale', lean='front_top' if far() else None)       # a pale cornice under the terrace parapet
    if not far():
        box(nm('rgal'), -2, 2, 4.06, 4.2, -.05, .7, 'Timber')
        box(nm('rgr'), -2, 2, 5.05, 5.13, .62, .7, 'Timber')
        if d0():
            palings(-2, 2, 4.2, 5.05, .64, 15, .05, 'Timber')
            for x in (-1.5, 1.5):
                prism(nm('rgb'), [(0, 4.06), (.65, 4.06), (.65, 3.98), (.2, 3.7), (0, 3.65)], x - .06, x + .06, 'Timber', axis='x')
        for x, s in ((-2, 1), (2, -1)):
            xa, xb = (x, x + .22) if s > 0 else (x - .22, x)
            pbox(nm('rq'), xa, xb, .3, E - .25, -.02, .05, 'Pale')


def rs_back():
    """bay_rs_back (MOONMERE.md section 5 "Requested templates (A-3)", Track P's departure 16):
    a riser house's BACK, seen from its orchard where no upper street stands behind it (E1-r0,
    W4-r0, the south-east half of W3-r1). The street rule (MM-1): mostly blank gold tufa ruled
    with the basalt bands, one shuttered window a bay on the upper storey and none below (the
    rule allows one in two bays; one file cannot alternate, so the lower storey is blank and
    carries two iron tie-plates on its band instead), a battered basalt plinth, and a pale
    cornice at the roof terrace's edge that the roof_flat lap balustrade (placed on every
    riser house already, 1.1 m) stands on -- so the module does not double the parapet (A-4).
    No door: the orchard is not a street. Frame: bay_rs_win's (placed turned pi on the back
    line), 4.0 x 7.2, a street face's 0.8 wall."""
    E = EAVE['rs']
    plinth(top=.6)
    h2 = [window(0, 4.45, .8, 1.5, 'GlassTallD', d=.32, lintel='Basalt', shutters=True)]
    wall(-2, 2, .6, 3.6, 'Tufa')
    rule(3.6, holes=h2)
    wall(-2, 2, 3.6, E - .35, 'Tufa', h2)
    pbox(nm('rbc'), -2, 2, E - .35, E, -.05, .38, 'Pale', lean='front_top' if far() else None)
    if not far():
        band(E - .62, .14)
        # modillions under the cornice (the blank back's one rhythm, LOD0 only) and a
        # terracotta downpipe from a hopper at the terrace's scupper down to the orchard
        for x in (-1.5, -.5, .5, 1.5):
            prism(nm('mod'), [(0, E - .35), (.34, E - .35), (.34, E - .43), (.12, E - .62), (0, E - .66)], x - .07, x + .07, 'Pale', axis='x')
        lathe(nm('dp'), [(.06, -.2, True), (.06, E - 1.0, True), (.09, E - .95, True), (.12, E - .7, True), (.12, E - .4, False)],
              'S_cotta', seg=6, cx=1.82, cz=.16, caps=False)
        for y in (1.4, 3.0, 4.6):
            box(nm('dpc'), 1.74, 1.9, y, y + .06, 0, .23, 'S_iron')
        for x in (-1.25, 1.25):
            # an iron tie-plate (an S anchor) where the floor's beams are tied through the wall
            box(nm('tie'), x - .03, x + .03, 3.05, 3.45, 0, .03, 'S_iron')
            box(nm('tie'), x - .14, x + .14, 3.22, 3.28, 0, .03, 'S_iron')


def cl(back='arch'):
    """A cloister range at a block's end (MM-1: "a quiet cloister court ... loggias"):
    stilted segmental arches on half-octagonal piers with banded voussoirs, a beamed walk
    with a reading bench, a storey over it, and its OUTER face (z = -4: the cross stair or
    lane) blank-ish and high-windowed. Its lean-to roof falls into the court."""
    E = EAVE['cl']; dep = DEPTH['cl']
    walk = -(dep - .6); wt = .55
    Ha = hole(-1.62, 1.62, 2.4, 2.7, .75, 10)
    for s in (-1, 1):
        x = 2.0 * s
        xa, xb = (x - .38, x) if s > 0 else (x, x + .38)
        if far():
            pbox(nm('pier'), xa, xb, 0, 2.4, -wt, .0, 'Pale', lean='front')
            continue
        if d0():
            angs = [-math.pi / 2 + k * math.pi / 4 for k in range(5)] if s < 0 else [math.pi / 2 + k * math.pi / 4 for k in range(5)]
            poly = [(x + .34 * math.cos(a_), -.28 + .34 * math.sin(a_)) for a_ in angs]
            vs = [(px, .35, pz) for px, pz in poly] + [(px, 2.2, pz) for px, pz in poly]
            mesh(nm('oct'), vs, [(i, i + 1, i + 6, i + 5) for i in range(4)], 'Pale', radial=(x, -.28, 1))
        else:
            box(nm('pier'), xa, xb, .35, 2.2, -.62, .06, 'Pale')
        box(nm('pb'), xa - (.05 if s < 0 else 0), xb + (.05 if s > 0 else 0), 0, .35, -.7, .12, 'Basalt')
        box(nm('pc'), xa - (.07 if s < 0 else 0), xb + (.07 if s > 0 else 0), 2.2, 2.4, -.72, .14, 'Basalt')
    wall(-2, 2, 2.4, 3.9, 'Lime', [Ha], z=0)
    wall(-2, 2, 2.4, 3.9, 'LimeS', [Ha], z=-wt, facing=-1)
    reveal(Ha, 0, wt, 'PaleS', sill=False, head=far())
    voussoirs(Ha, .4, .06, -wt - .02, n=11, surfs=('Pale', 'Basalt'))
    band(3.84, .2)
    quad(nm('wf'), [(-2, .03, 0), (2, .03, 0), (2, .03, walk), (-2, .03, walk)], 'S_lime_s' if far() else 'Pale', (0, 1, 0))
    quad(nm('wc'), [(-2, 3.9, -wt), (2, 3.9, -wt), (2, 3.9, walk), (-2, 3.9, walk)], 'TimberD', (0, -1, 0))
    if d0():
        for bx in (-1.33, 0, 1.33):
            box(nm('wb'), bx - .08, bx + .08, 3.68, 3.9, walk, -wt, 'Timber')
        box(nm('bench'), -1.5, 1.5, .4, .48, walk, walk + .42, 'Pale')
        for x in (-1.2, 1.2):
            box(nm('bl'), x - .12, x + .12, 0, .4, walk + .04, walk + .36, 'Basalt')
    hb = [window(0, 1.3, .9, 1.6, 'GlassTallD', z=walk, d=.2, lintel='Pale')]
    wall(-2, 2, 0, 3.9, 'S_shade' if far() else 'LimeS', hb, z=walk)
    mount('lamp', 1.2, 2.5, walk, inside=True)
    # the storey over the walk, court side
    Hw = window(0, 4.6, .9, 1.6, 'GlassTall', rise=.2, vous=.24, shutters=True)
    wall(-2, 2, 4.04, E - .3, 'Lime', [Hw])
    pbox(nm('plate'), -2, 2, E - .3, E, -.1, .1, 'Timber', lean='front' if far() else None)
    # the OUTER face (z = -dep, facing -z): socle, tufa, two bands, two high windows
    zo = -dep
    hs_o = [] if far() else [hole(x - .3, x + .3, 4.9, 5.9, 0, 1) for x in (-1.0, 1.0)]
    wall(-2, 2, -POD, .4, 'Basalt', z=zo, facing=-1)
    wall(-2, 2, .4, 4.6, 'Tufa', z=zo, facing=-1)
    wall(-2, 2, 4.6, E, 'Tufa', hs_o, z=zo, facing=-1)
    with G.at(z=zo):
        with G.at(M=RY(math.pi)):
            for H in hs_o:
                Hm = dict(H, a=-H['b'], b=-H['a'], top=[(-x, y) for x, y in reversed(H['top'])])
                reveal(Hm, 0, .28, 'PaleS'); infill(Hm, -.28, 'GlassHigh')
                if not far(): box(nm('ol'), Hm['a'] - .15, Hm['b'] + .15, 5.9, 6.12, -.04, .06, 'Basalt')
            band(4.5, .24); band(E - .32, .24)
            mount('lamp', 0, 3.6, 0, outer=True)
    # the lean-to roof, falling into the court (pantile: wash-tinted in a bay, MOONMERE.md)
    p = math.tan(math.radians(16))
    yh = E + .3 + p * (dep + .9)
    F0, F1 = (-2, E + .3, .9), (2, E + .3, .9)
    B0, B1 = (-2, yh, zo - .4), (2, yh, zo - .4)
    roof_plane([F0, F1, B1, B0], (1, 0, 0), Vector((0, 1, p)).normalized())
    eave_edge(F0, F1, (0, 0, 1), E + .3, .9, soffit='X_eave_band')
    quad(nm('rbk'), [(2, E, zo), (-2, E, zo), (-2, yh, zo - .4), (2, yh, zo - .4)], 'Timber', (0, 0, -1))


def wr(back):
    """The quay warehouse: a basalt loading storey (3.6) and a tufa loft (2.6) under the
    roof terrace at 7.2 (D-4); a hoist beam, loft doors, loading arches onto the apron."""
    E = EAVE['wr']
    h1, h2 = [], []
    gaps = []
    if back == 'load':
        Hl = hole(-1.4, 1.4, 0.0, 2.8, .6, 10)
        gaps.append((-1.42, 1.42)); h1.append(Hl)
        reveal(Hl, 0, .6, 'BasaltS', sill=False, head_from=0 if far() else -.3)
        voussoirs(Hl, .44, .1, -.3, n=11, surfs=('Pale', 'Tufa'))
        # the loading bay behind: side walls, floor, the loft's ceiling and a back of sacks
        # and bales at the hall's inner wall (z -5.2; MOONMERE.md "wr_in")
        zb = -5.2
        for x, sg in ((-1.4, 1), (1.4, -1)):
            quad(nm('lbw'), [(x, 0, -.6), (x, 0, zb), (x, 3.3, zb), (x, 3.3, -.6)], 'S_shade' if far() else 'BasaltS', (sg, 0, 0))
        quad(nm('lbf'), [(-1.4, .02, 0), (1.4, .02, 0), (1.4, .02, zb), (-1.4, .02, zb)], 'S_shade' if far() else 'Pale', (0, 1, 0))
        quad(nm('lbc'), [(-1.4, 3.3, -.6), (1.4, 3.3, -.6), (1.4, 3.3, zb), (-1.4, 3.3, zb)], 'S_shade' if far() else 'TimberD', (0, -1, 0))
        quad(nm('lbb'), [(-1.4, 0, zb), (1.4, 0, zb), (1.4, 3.3, zb), (-1.4, 3.3, zb)], 'R_goods', (0, 0, 1))
        if d0():
            for s in (-1, 1):
                hx = -1.3 if s < 0 else 1.3
                with G.at(M=T(hx, 0, -.45) @ RY(-s * math.radians(72))):
                    x0, x1 = (0, 1.3) if s < 0 else (-1.3, 0)
                    box(nm('ldr'), x0, x1, .05, 2.9, -.04, .04, 'R_loft')
        mount('crates', 1.9, 0, 1.2)
    elif back == 'door':
        Hd = hole(-.7, .7, 0, 2.6, .4, 9)
        gaps.append((-.72, .72)); h1.append(Hd)
        reveal(Hd, 0, .45, 'PaleS', sill=False, head_from=None if far() else -.22)
        voussoirs(Hd, .32, .06, -.22, n=9, surfs=('Pale', 'Tufa'))
        mount('door', 0, 0, -.41, axes=[1.0, 1.0, 1])
        if not far():
            box(nm('wstep'), -.85, .85, -.3, .12, -.02, .38, 'Pale')      # a worn stone step before the door
        h1.append(window(1.45, 1.6, .5, 1.0, 'GlassHigh', d=.3, lintel='Pale', sill_slab=False, grille=True))
        mount('lamp', -1.35, 2.9, 0)
        mount('nets', -1.6, 0, .9)
        if d0():
            # the door bays hang a sail-drying gallery too (the quay's timber line, unbroken)
            box(nm('dgf'), -2, 2, 3.84, 3.98, -.05, .9, 'Timber')
            palings(-2, 2, 3.98, 4.9, .82, 16, .05, 'Timber', d=.04, sides=False)
            box(nm('dgr'), -2, 2, 4.9, 4.98, .8, .9, 'Timber')
            for x in (-1.5, 0.0, 1.5):
                prism(nm('dgb'), [(0, 3.84), (.85, 3.84), (.85, 3.76), (.25, 3.3), (0, 3.2)], x - .06, x + .06, 'Timber', axis='x')
        if d0():
            # a TIDE GAUGE on the pier: a pale stone staff with basalt marks every 0.25 m --
            # the quay's reading of the mere, kept since before the empire went quiet
            pbox(nm('tg'), -1.95, -1.62, .5, 3.5, .07, .16, 'Pale')
            for k in range(12):
                y = .6 + k * .25
                pbox(nm('tgm'), -1.95 if k % 4 else -2.0, -1.78, y, y + .04, .16, .19, 'Basalt')
    else:
        for x in (-.95, .95):
            h1.append(window(x, 1.4, .8, 1.25, 'GlassHigh', d=.35, rise=.25, vous=.26, n=7, sill_slab=False, grille=True))
        mount('lamp', 0, 3.05, 0); mount('crates', 0, 0, 1.0)
        if not far():
            # the harbour's tally board between the windows: a ledger of tides and cargoes
            quad(nm('tally'), [(-.42, 1.7, .04), (.42, 1.7, .04), (.42, 2.25, .04), (-.42, 2.25, .04)], 'R_board', (0, 0, 1))
        if d0():
            # a sail-drying gallery hung from the loft on brackets, with its rail
            box(nm('dgf'), -2, 2, 3.84, 3.98, -.05, .9, 'Timber')
            palings(-2, 2, 3.98, 4.9, .82, 16, .05, 'Timber', d=.04, sides=False)
            box(nm('dgr'), -2, 2, 4.9, 4.98, .8, .9, 'Timber')
            for x in (-1.5, 0.0, 1.5):
                prism(nm('dgb'), [(0, 3.84), (.85, 3.84), (.85, 3.76), (.25, 3.3), (0, 3.2)], x - .06, x + .06, 'Timber', axis='x')
            quad(nm('sailc'), [(-1.6, 4.1, .93), (.4, 4.1, .93), (.4, 4.85, .93), (-1.6, 4.85, .93)], 'R_linen', (0, 0, 1))   # over the rail, off the palings' plane
    # the loft: a loft door with its sill-beam, or two small windows
    if back in ('load', 'door'):
        Hf = hole(-.62, .62, 3.95, 5.6, 0, 1)
        h2.append(Hf); reveal(Hf, 0, .22, 'PaleS'); infill(Hf, -.22, 'R_loft')
        if not far():
            # a boarded hood over the loft door on two brackets
            p_ = math.tan(math.radians(28))
            quad(nm('hood'), [(-.85, 5.7, .55), (.85, 5.7, .55), (.85, 5.7 + p_ * .55, 0), (-.85, 5.7 + p_ * .55, 0)], 'Timber', (0, 1, p_))
            quad(nm('hoodu'), [(.85, 5.66, .55), (-.85, 5.66, .55), (-.85, 5.66 + p_ * .55, 0), (.85, 5.66 + p_ * .55, 0)], 'TimberD', (0, -1, -p_))
            for x in (-.75, .75):
                prism(nm('hbr'), [(0, 5.66), (.5, 5.66), (0, 5.2)], x - .04, x + .04, 'Timber', axis='x')
        pbox(nm('lsil'), -.8, .8, 3.8, 3.95, -.05, .4 if not far() else .1, 'Timber', lean='front_top' if far() else None)
    else:
        for x in (-1.0, 1.0):
            Hw = hole(x - .38, x + .38, 4.2, 5.4, 0, 1)
            h2.append(Hw); reveal(Hw, 0, .22, 'PaleS'); infill(Hw, -.22, 'R_loft' if x < 0 else 'GlassSq')
            if x > 0: mount('shutters', x, 4.2, 0, axes=[.76, .6, 1])
    plinth(top=.5, gaps=gaps, z0=.16, z1=.07)
    if d0():
        for x in ((-1.65, 1.65) if back != 'load' else (-1.75, 1.75)):
            lathe(nm('ring'), [(.1, -.02, True), (.14, -.02, True), (.14, .02, True), (.1, .02, True)], 'S_iron', seg=8,
                  M=T(x, .35, .2) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
    wall(-2, 2, .5, 3.6, 'Basalt', h1)
    pbox(nm('band'), -2, 2, 3.6, 3.84, -.08, .07, 'Pale', lean='front' if far() else None)
    wall(-2, 2, 3.84, E - .3, 'Tufa', h2)
    pbox(nm('plate'), -2, 2, E - .3, E, -.1, .12, 'Timber', lean='front' if far() else None)
    if not far():
        box(nm('pier'), -2, -1.75, .5, 3.6, -.04, .07, 'Pale')
        box(nm('pier'), 1.75, 2, .5, 3.6, -.04, .07, 'Pale')
    if back == 'load':
        # the hoist beam, its block and rope (brass is a painted swatch on small things)
        if not far():
            pbox(nm('hb'), -.12, .12, E - .55, E - .3, -.3, 1.5, 'Timber')
        if not far():
            prism(nm('hbr'), [(0, E - .55), (.8, E - .55), (.8, E - .65), (0, E - 1.3), (0, E - 1.4)], -.06, .06, 'Timber', axis='x')
            if d0():
                # A-7 (the look review: "the same blank pale box hanging from every hoist beam,
                # an orange ball above it"): a timber PULLEY BLOCK -- two cheeks round a dark
                # iron sheave, an iron strap to the beam -- the rope and the hook; what hangs on
                # the hook is the dressing's (the 'hoist' mount: sacks, a barrel, or nothing)
                box(nm('pstr'), -.025, .025, E - .78, E - .55, 1.29, 1.35, 'S_iron')
                for sx in (-.07, .07):
                    obox(nm('pblk'), sx - .025, sx + .025, E - 1.12, E - .78, 1.2, 1.44, 'S_oak', omit=())
                lathe(nm('pshv'), [(0, -.045, False), (.1, -.045, True), (.1, .045, True), (0, .045, False)], 'S_iron', seg=8,
                      M=T(0, E - .95, 1.32) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
                box(nm('rope'), -.015, .015, 2.62, E - 1.0, 1.3, 1.33, 'S_rope')
                box(nm('rope2'), -.015, .015, 3.2, E - 1.0, 1.38, 1.41, 'S_rope')
                lathe(nm('hook'), [(.05, -.03, True), (.09, -.03, True), (.09, .03, True), (.05, .03, True)], 'S_iron', seg=8, a0=0, a1=4.4,
                      M=T(0, 2.52, 1.32) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), caps=False)
                box(nm('hks'), -.02, .02, 2.58, 2.66, 1.3, 1.34, 'S_iron')
                mount('hoist', 0, 2.44, 1.32)
                quad(nm('tally'), [(1.55, 1.6, .08), (1.95, 1.6, .08), (1.95, 2.3, .08), (1.55, 2.3, .08)], 'R_board', (0, 0, 1))


# ====================================================================== roofs (skyline)
def plane_uv(V, e, s):
    return (V.dot(e) / 2, V.dot(s) / 2)


def roof_plane(poly, e, n, surf='Pantile'):
    """A roof plane (planar polygon), cut at whole 2 m tiles up the slope (band_split) so
    it samples one copy of the pantile strip; the rolls are painted on the strip, their
    3D ends live in eave_brk (LOD0 only)."""
    P = [Vector(p) for p in poly]
    e = Vector(e).normalized(); n = Vector(n).normalized()
    s = n.cross(e).normalized()
    if (P[2] - P[0]).dot(s) < 0: s = -s
    uv = [plane_uv(p, e, s) for p in P]
    region = G.SURF[surf][2]
    rep = A.STRIPS[region][3] if G.SURF[surf][1] == 'strip' else 1e9
    # LOOK PASS M2 ("the big hip roofs read as flat tiled sheets"): a pitched plane is laid in
    # 2 m bands up the slope already (one strip copy each); each band takes a vertex shade
    # from 0.86 at the eave to 1.0 at the ridge -- weathered eaves, a sun-bleached crown --
    # at no cost in triangles. Flat planes (decks) stay even.
    vs_ = [t[1] for t in uv]; v0, v1 = min(vs_), max(vs_)
    pitched = abs(n.y) < .985 and v1 - v0 > 1e-6
    for pts, uvb in G.cut_uv(P, uv, rep):
        vm = sum(t[1] for t in uvb) / len(uvb)
        tint = .86 + .14 * (vm - v0) / (v1 - v0) if pitched else 1.0
        mesh(nm('slab'), pts, [tuple(range(len(pts)))], surf, uvs=[uvb], normals2=[n], tint=tint)


def tube(P0, P1, r, up, seg=4, surf='Ridge', close=False):
    """A half-round roll (ridge or hip) from P0 to P1. close: its underside chord too -- where
    a hip's planes fall away under the roll's edges, a look from below passed under it and
    out through the open half-round (the Long Tower's cap: a sky line along every hip)."""
    P0, P1 = Vector(P0), Vector(P1)
    ax = (P1 - P0).normalized(); up = Vector(up)
    side = ax.cross(up).normalized(); upp = side.cross(ax).normalized()
    if upp.dot(up) < 0: upp = -upp
    vs, fs, n2 = [], [], []
    for j in range(seg + 1):
        ph = math.pi * j / seg
        off = side * (r * math.cos(ph)) + upp * (r * math.sin(ph))
        vs += [tuple(P0 + off), tuple(P1 + off)]
    for j in range(seg):
        i0 = 2 * j
        fs.append((i0, i0 + 2, i0 + 3, i0 + 1))
        ph = math.pi * (j + .5) / seg
        n2.append(side * math.cos(ph) + upp * math.sin(ph))
    mesh(nm('tube'), vs, fs, surf, normals2=n2, smooth=True)
    if close:
        a_, b_ = P0 + side * r, P1 + side * r
        c_, d_ = P1 - side * r, P0 - side * r
        mesh(nm('tubu'), [tuple(a_), tuple(b_), tuple(c_), tuple(d_)], [(0, 1, 2, 3)], surf, normals2=[-upp])


def eave_edge(P0, P1, out, ytop, depth_in, fascia=.24, soffit='R_eave_band', surf='Timber', mitre=False, sark=None):
    """Fascia board and soffit along an eave from P0 to P1 (points at the tile edge,
    y = ytop): the soffit runs back depth_in toward -out, PAINTED with the brackets'
    silhouettes (the always-drawn half of the split eave).

    Review 2026-10-06 (the Long Tower's eave showed sky lines):
      * the soffit's inner edge drops to the wall top (ytop - YE, the eave datum) instead of
        stopping 0.08 over it -- the slot between the wall plate and the soffit is closed
        with no extra triangle;
      * mitre (True, or (start, end); -1 at a concave corner): where two eaves meet round a closed roof the soffits
        are mitred at the corner (they overlapped, a square that z-fought under every hip);
      * sark (the roof's slope, tan): a boarded underside under the tiles from the fascia's
        top inward, so a low look past the fascia meets timber, not the roof's culled back."""
    P0, P1 = Vector(P0), Vector(P1); out = Vector(out).normalized()
    m0, m1 = (mitre, mitre) if isinstance(mitre, (bool, int, float)) else mitre
    e = (P1 - P0); e.y = 0; e = e.normalized()
    yb = ytop - fascia
    drop = (YE - fascia) if abs(fascia - .24) < 1e-6 else 0.0
    a = Vector((P0.x, yb, P0.z)); b = Vector((P1.x, yb, P1.z))
    quad(nm('fas'), [tuple(a), tuple(b), (P1.x, ytop + .02, P1.z), (P0.x, ytop + .02, P0.z)], surf, tuple(out))
    ai = a - out * depth_in + e * depth_in * float(m0) - Vector((0, drop, 0))
    bi = b - out * depth_in - e * depth_in * float(m1) - Vector((0, drop, 0))
    nrm = Vector((0, -1, 0)) if drop == 0 else (bi - b).cross(a - b).normalized()
    if nrm.y > 0: nrm = -nrm
    if soffit.startswith('X_'):
        quad(nm('sof'), [tuple(a), tuple(b), tuple(bi), tuple(ai)], soffit, tuple(nrm), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    else:
        quad(nm('sof'), [tuple(a), tuple(b), tuple(bi), tuple(ai)], soffit, tuple(nrm))
    if sark is not None:
        up = Vector((0, depth_in * sark, 0))
        # IN the roof's plane, facing down (back to back with the tiles: never both drawn) -- a
        # sheet 3 cm under it let a look skimming the fascia's top pass between the two
        t0 = Vector((P0.x, ytop, P0.z)); t1 = Vector((P1.x, ytop, P1.z))
        s0 = t0 - out * depth_in + e * depth_in * float(m0) + up
        s1 = t1 - out * depth_in - e * depth_in * float(m1) + up
        quad(nm('sark'), [tuple(t0), tuple(t1), tuple(s1), tuple(s0)], 'TimberD', tuple(-(out * sark) + Vector((0, -1, 0))))


def bracket(x, y_top, z0, depth=.95, h=.8, w=.14, dirn=1, surf='Timber'):
    """A carved timber eave bracket (yz profile, extruded along x), pointing +z (dirn 1)."""
    d = depth * dirn
    pts = [(z0, y_top), (z0 + d, y_top), (z0 + d, y_top - .14), (z0 + d * .45, y_top - .36), (z0, y_top - h)]
    # the two side faces and the three faces of the curve; the top (under the soffit) and
    # the back (against the wall) are never seen
    vs = [(x - w / 2, y, z) for z, y in pts] + [(x + w / 2, y, z) for z, y in pts]
    fs = [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5), (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4)]
    ns = [Vector((-1, 0, 0)), Vector((1, 0, 0)), Vector((0, 0, dirn)), Vector((0, -.5, dirn)).normalized(), Vector((0, -1, dirn * .6)).normalized()]
    mesh(nm('brk'), vs, fs, surf, normals2=ns)


def roll_ends(x0, x1, z, y, dirn, n_per_m=4, r=.1):
    """The glazed roll ends along an eave (the part of a pantile roof that shows in
    silhouette): eave_brk's half of the split eave."""
    vs, fs, n2 = [], [], []
    k = int(round((x1 - x0) * n_per_m))
    seg = 2
    for i in range(k):
        cx = x0 + (i + .5) * (x1 - x0) / k
        base = len(vs)
        for j in range(seg + 1):
            ph = math.pi * j / seg
            off = Vector((r * math.cos(ph), r * math.sin(ph) + .01, 0))
            p0 = Vector((cx, y, z)) + off; p1 = p0 + Vector((0, PITCH * .4, -.4 * dirn))
            vs += [tuple(p0), tuple(p1)]
        for j in range(seg):
            i0 = base + 2 * j
            fs.append((i0, i0 + 2, i0 + 3, i0 + 1) if dirn > 0 else (i0, i0 + 1, i0 + 3, i0 + 2))
            ph = math.pi * (j + .5) / seg
            n2.append(Vector((math.cos(ph), math.sin(ph), 0)))
        cap = [base + 2 * j for j in range(seg + 1)]
        fs.append(tuple(cap) if dirn > 0 else tuple(cap[::-1])); n2.append(Vector((0, 0, dirn)))
    mesh(nm('rolls'), vs, fs, 'Pantile', normals2=n2, smooth=True)


YE = .32                    # the tile edge sits 0.32 over the eave datum (on the brackets)
YR = YE + PITCH * (D / 2 + OVH)   # the hip roof's ridge over the eave datum


def roof_run():
    """A 4 m hip-roof slice (18 deg): two slopes, ridge roll, fascias and painted soffits.
    Origin: the bay centre on the facade plane, y 0 = the eave datum."""
    o = OVH
    F0, F1 = (-2, YE, o), (2, YE, o)
    B0, B1 = (-2, YE, -D - o), (2, YE, -D - o)
    R0, R1 = (-2, YR, -D / 2), (2, YR, -D / 2)
    roof_plane([F0, F1, R1, R0], (1, 0, 0), Vector((0, 1, PITCH)))
    roof_plane([B1, B0, R0, R1], (-1, 0, 0), Vector((0, 1, -PITCH)))
    tube((-2, YR + .02, -D / 2), (2, YR + .02, -D / 2), .15, (0, 1, 0))
    eave_edge(F0, F1, (0, 0, 1), YE, o, soffit='X_eave_band')
    eave_edge(B1, B0, (0, 0, -1), YE, o, soffit='X_eave_band')


def roof_hip_end():
    """The hipped end of a run, replacing the end bay's slice. Origin: the END WALL's line
    at MID-DEPTH; +x out through the end; the slice reaches 4 m in (to the next bay's
    joint) and overhangs 1 m out. One file serves both ends (-x end: yaw + pi)."""
    o = OVH; hz = D / 2 + o; xr = 1.0 - 4.5
    F0, F1 = (-4, YE, hz), (o, YE, hz)
    B0, B1 = (-4, YE, -hz), (o, YE, -hz)
    R0, R1 = (-4, YR, 0), (xr, YR, 0)
    roof_plane([F0, F1, R1, R0], (1, 0, 0), Vector((0, 1, PITCH)))
    roof_plane([B1, B0, R0, R1], (-1, 0, 0), Vector((0, 1, -PITCH)))
    pe = (YR - YE) / (o - xr)
    roof_plane([F1, B1, R1], (0, 0, -1), Vector((pe, 1, 0)))
    tube((-4, YR + .02, 0), (xr, YR + .02, 0), .15, (0, 1, 0))
    tube(F1, R1, .12, (0, 1, 0), seg=3); tube(B1, R1, .12, (0, 1, 0), seg=3)
    eave_edge(F0, F1, (0, 0, 1), YE, o, mitre=(False, True))
    eave_edge(B1, B0, (0, 0, -1), YE, o, mitre=(True, False))
    eave_edge(F1, B1, (1, 0, 0), YE, o, mitre=True)


def roof_gable_end():
    """A gable end, replacing the end bay's slice (MOONMERE.md: "a bracketed verge and a
    banded gable wall with an oculus"). Same frame as roof_hip_end. The gable is BOARDED
    timber between pale and basalt string courses, not tufa: this pool takes the roof's
    glaze tint (one tint class per pool), and a glazed timber gable reads as painted
    boarding where glazed stone would read as stained."""
    o = OVH; hz = D / 2 + o; v = .6
    F0, F1 = (-4, YE, hz), (v, YE, hz)
    B0, B1 = (-4, YE, -hz), (v, YE, -hz)
    R0, R1 = (-4, YR, 0), (v, YR, 0)
    roof_plane([F0, F1, R1, R0], (1, 0, 0), Vector((0, 1, PITCH)))
    roof_plane([B1, B0, R0, R1], (-1, 0, 0), Vector((0, 1, -PITCH)))
    tube((-4, YR + .02, 0), (v + .05, YR + .02, 0), .15, (0, 1, 0))
    eave_edge(F0, F1, (0, 0, 1), YE, o)
    eave_edge(B1, B0, (0, 0, -1), YE, o)
    # the gable: a pentagon on the end wall's plane, its top under the slab
    yw = PITCH * (o) + YE - .12
    ya = YR - .18
    pent = [(-D / 2, 0), (D / 2, 0), (D / 2, yw), (0, ya), (-D / 2, yw)]
    vs = [(0, y, -z) for z, y in pent]
    mesh(nm('gab'), vs, [tuple(range(5))], 'R_loft', facing=(1, 0, 0))
    quad(nm('gsb'), [(.1, -.1, D / 2), (.1, -.1, -D / 2), (.1, .14, -D / 2), (.1, .14, D / 2)], 'S_iron', (1, 0, 0))
    # the verge: bargeboards under both slopes' edges, their soffits painted
    for sg in (1, -1):
        P0 = Vector((v, YE, sg * hz)); P1 = Vector((v, YR, 0))
        quad(nm('barge'), [tuple(P0 + Vector((0, -.26, 0))), tuple(P1 + Vector((0, -.26, 0))), tuple(P1 + Vector((0, .02, 0))), tuple(P0 + Vector((0, .02, 0)))][::(1 if sg < 0 else -1)],
             'Timber', (1, 0, 0))
        quad(nm('vsof'), [tuple(P0 + Vector((0, -.26, 0))), tuple(P1 + Vector((0, -.26, 0))), (0, P1.y - .26, 0), (0, P0.y - .26, P0.z)][::(1 if sg > 0 else -1)],
             'R_eave_band', (0, -1, 0))
    # the oculus: a louvred round in a pale ring
    oc = (ya + .2) * .45
    quad(nm('ocu'), [(.04, oc - .45, .45), (.04, oc - .45, -.45), (.04, oc + .45, -.45), (.04, oc + .45, .45)], 'GlassRound', (1, 0, 0))


def roof_mono():
    """A monopitch slice falling to the court (MOONMERE.md "monopitch into the court"): on
    the street a deep bracketed high eave over a louvred sun-loft (timber: this pool takes
    the glaze tint), the slope down to a low eave over the court. Origin as roof_run."""
    # the attic is 1.7 high so the slope clears the court face's wall top at z -9 (0.08 over it)
    o = OVH; p = math.tan(math.radians(11)); att = 1.7
    yh = att + YE; yl = yh - p * (D + 2 * o)
    F0, F1 = (-2, yh, o), (2, yh, o)
    B0, B1 = (-2, yl, -D - o), (2, yl, -D - o)
    roof_plane([B1, B0, F0, F1], (-1, 0, 0), Vector((0, 1, p)))
    eave_edge(F0, F1, (0, 0, 1), yh, o, soffit='X_eave_band')
    eave_edge(B1, B0, (0, 0, -1), yl, o, soffit='X_eave_band')
    # the sun-loft: louvred boards between posts, standing on the eave datum
    quad(nm('sl'), [(-2, 0, .02), (2, 0, .02), (2, att + .1, .02), (-2, att + .1, .02)], 'R_louvre', (0, 0, 1))
    pbox(nm('slb'), -2, 2, -.06, .14, -.06, .1, 'S_oak')
    for x in (-1.92, 0.0):
        pbox(nm('slp'), x - .08, x + .08, 0, att + .1, -.04, .1, 'S_oak')


def roof_mono_end():
    """The end of a monopitch run: a boarded gable under the slope, finished on BOTH faces
    and symmetric about its own plane, so one file closes either end at the same yaw.
    Origin: the end wall's line on the facade plane, y 0 = the eave datum."""
    o = OVH; p = math.tan(math.radians(11)); att = 1.7
    yh = att + YE - .05; yl = yh - p * (D + o) + .02
    prof = [(0, 0), (0, yh), (-D, yl), (-D, 0)]
    prism(nm('me'), [(z, y) for z, y in prof], -.12, .12, 'R_loft', axis='x')
    yt = att + YE + .04
    nrm = Vector((0, 1, p)).normalized()
    F = lambda x: (x, yt, o); Bk = lambda x: (x, yt - p * (D + 2 * o), -D - o)
    roof_plane([Bk(.45), Bk(-.45), F(-.45), F(.45)], (-1, 0, 0), nrm)
    for x, f in ((.45, 1), (-.45, -1)):
        q = [(x, yt - .28, o), (x, yt + .02, o), (x, yt - p * (D + 2 * o) + .02, -D - o), (x, yt - p * (D + 2 * o) - .28, -D - o)]
        quad(nm('mv'), q if f > 0 else q[::-1], 'Timber', (f, 0, 0))
    quad(nm('mvu'), [(-.45, yt - .28, o), (.45, yt - .28, o), (.45, yt - p * (D + 2 * o) - .28, -D - o), (-.45, yt - p * (D + 2 * o) - .28, -D - o)], 'S_shade', (0, -1, 0))


def roof_pav():
    """A pavilion roof: a square pyramid over a two-bay (8 m) house, stretched in x to 12
    m for three bays (MOONMERE.md), with hip rolls (flat), no finial (8 KB). Origin: the
    house's centre at mid-depth, y 0 = the eave datum."""
    o = OVH; hx = 4 + o; hz = D / 2 + o
    pp = math.tan(math.radians(24))
    ap = (0, YE + pp * min(hx, hz), 0)
    c = [(-hx, YE, hz), (hx, YE, hz), (hx, YE, -hz), (-hx, YE, -hz)]
    r0 = (-(hx - hz), ap[1], 0) if hx > hz else ap; r1 = ((hx - hz), ap[1], 0) if hx > hz else ap
    roof_plane([c[0], c[1], r1, r0] if hx > hz else [c[0], c[1], ap], (1, 0, 0), Vector((0, 1, pp)))
    roof_plane([c[2], c[3], r0, r1] if hx > hz else [c[2], c[3], ap], (-1, 0, 0), Vector((0, 1, -pp)))
    roof_plane([c[3], c[0], r0], (0, 0, 1), Vector((-pp, 1, 0)))
    roof_plane([c[1], c[2], r1], (0, 0, -1), Vector((pp, 1, 0)))
    for k in range(4):
        tube(c[k], r0 if k in (0, 3) else r1, .12, (0, 1, 0), seg=1)     # a flat hip roll: the contract's 8 KB
    if hx > hz: tube(r0, r1, .14, (0, 1, 0), seg=1)
    eave_edge(c[0], c[1], (0, 0, 1), YE, o, mitre=True); eave_edge(c[2], c[3], (0, 0, -1), YE, o, mitre=True)
    eave_edge(c[3], c[0], (-1, 0, 0), YE, o, mitre=True); eave_edge(c[1], c[2], (1, 0, 0), YE, o, mitre=True)
    # (no finial: the contract's 8 KB for an always-drawn slice; the turret and tower caps keep theirs)


def roof_flat():
    """A flat roof terrace (MOONMERE.md: the riser ranks' and quay rows' roofs, and the
    'terrace' crown): a deck of glazed tiles at the eave datum (= the next level for a riser
    rank), a low parapet with a painted balustrade over the house's front, and on the lap
    edge (z = -D - 0.3, the parapet line) the 1.1 m balustrade of the upper street, turned
    balusters on a curb (it gets the planner's box collider: never walkable, D-4/D-5).
    Built for 9.0 deep; stretched in z to 8.0 / 8.5 (the deck has no pitch to keep)."""
    lap = DAT.get('roofLap', .3) if isinstance(DAT.get('roofLap'), float) else .3
    zb = -D - lap
    # LOOK PASS M2 (2026-10-06: "the large timber roof terraces read as flat dark planes"): the
    # deck is laid in sun-bleached COTTO (iteration 1 paved it in the pale tufa: from 90 m that
    # read as a flat pale plane, as blank as the boards), and the pool moves to the WASH tint class (A-4,
    # closing A-2's proposed one line and O-9): no glaze can turn it pink, and each house's
    # wash warms its own terrace. A basalt drain channel runs inside the front parapet.
    # the cotto deck, one 2 m square of the painted rect a piece (a rect does not wrap)
    # (A-7: each 2 m square turned and mirrored against its neighbours -- the painted square
    # is one lay of large tiles with a worn path across it, and laid the same way every
    # time it read as a ruled grid, the review's "bathroom tile")
    z_ = -.32; row = 0
    while z_ > zb + .25 + 1e-6:
        z1_ = max(zb + .25, z_ - 2.0); fv = (z_ - z1_) / 2.0
        for col, x0_ in enumerate((-2.0, 0.0)):
            k = (row * 2 + col) % 4
            uv = [(0, 0), (1, 0), (1, fv), (0, fv)] if k == 0 else [(1, 0), (0, 0), (0, fv), (1, fv)] if k == 1 else \
                [(0, 1), (1, 1), (1, 1 - fv), (0, 1 - fv)] if k == 2 else [(1, 1), (0, 1), (0, 1 - fv), (1, 1 - fv)]
            quad(nm('cot'), [(x0_, .04, z_), (x0_ + 2, .04, z_), (x0_ + 2, .04, z1_), (x0_, .04, z1_)], 'X_cotto', (0, 1, 0), uvs=uv)
        z_ = z1_; row += 1
    quad(nm('drn'), [(-2, .03, .1), (2, .03, .1), (2, .03, -.32), (-2, .03, -.32)], 'S_iron', (0, 1, 0))
    # the front: a pale cornice and a low parapet whose balustrade is painted (a card)
    pbox(nm('fcor'), -2, 2, -.2, .3, -.1, .32, 'S_pale_s', keep=(2, 3, 4))
    card(nm('fbal'), -2, 2, .3, .95, .02, 'X_balus', back=True)
    obox(nm('frail'), -2, 2, .95, 1.05, -.12, .16, 'S_hull', omit=('-x', '+x'))
    # the lap edge: the upper street's balustrade, 1.1 m, real balusters (seen at arm's length);
    # curbs and rails on the pale stand-in swatch so no tile line slices them (<= 120 triangles)
    # the lap balustrade's curb and rail are TIMBER under the glaze, a painted rail (review
    # 2026-10-06: a pale stone rail under the plum glaze turned pink)
    # A-7 (the look review: "the balustrades are chunky square-post fences ... behind N1 the
    # L2 lawn meets the terrace rail with a visible gap that shows the facade below"): the lap
    # edge is a PARAPET WITH A COPING -- tufa under the house's wash, a pale coping -- and its
    # outer face carried 2 m down over the joint with the upper level, as parapet_run's is
    # over a riser's lip, so no slot shows between the street above and the terrace
    t_ = .3
    # (tufa under the house's wash, the pale stone coping: a flat swatch read as a blank slab)
    quad(nm('bpi'), [(-2, .04, zb + t_), (2, .04, zb + t_), (2, PARAPET - .1, zb + t_), (-2, PARAPET - .1, zb + t_)], 'Tufa', (0, 0, 1))
    # (S1: the Crown report's "bright white pale wall ... in the street's foreground": the face the
    # upper street sees is the tufa in its own shade, ruled in basalt under the coping)
    quad(nm('bpo'), [(2, -2.0, zb), (-2, -2.0, zb), (-2, PARAPET - .1, zb), (2, PARAPET - .1, zb)], 'TufaS', (0, 0, -1))
    obox(nm('bcop'), -2, 2, PARAPET - .1, PARAPET, zb - .06, zb + t_ + .06, 'Pale', omit=('-x', '+x'))
    if not far():
        box(nm('bpb'), -2, 2, .38, .5, zb - .03, zb + t_ + .03, 'Basalt')
        obox(nm('bpr'), -2, 2, PARAPET - .24, PARAPET - .17, zb - .025, zb + t_ + .025, 'Basalt', omit=('-x', '+x', '-y', '+y'))


def pergola():
    """A pergola on a roof terrace slice: two timber posts, two beams, four rafters, and a
    vine over them -- always drawn, so lean (flat oak swatch: no tile slicing), wash-tinted
    with the house. Origin as roof_flat. LOOK PASS M2 (2026-10-06: the vine was three flat
    green slabs): leaf clusters along the rafters shaded as one canopy, wisteria racemes
    hanging between them, and a trunk climbing the front post."""
    import random as _r
    rng = _r.Random(23)
    yd = .04; h = 2.4
    # S1 (GATE-1 look item 10, "pergola beams float over the street"): FOUR posts, one at each
    # corner, and the beams and rafters trimmed to them -- the old frame stood on two posts at
    # one side and carried its beams 4 m out to the bay's edge, over the end parapet and into the
    # air above the street (MEASURED on QN's terrace, LOOKED from the Mere Walk). Now nothing
    # passes the posts by more than a beam's end (0.12), 0.5 m inside the bay's edges, so a
    # pergola on an end bay stands inside the terrace's parapet
    px = 1.42
    for z in (-1.6, -6.4):
        for x in (-px, px):
            obox(nm('pp'), x - .08, x + .08, yd, yd + h, z - .08, z + .08, 'S_oak', omit=('-y', '+y'))
        obox(nm('pb'), -px - .12, px + .12, yd + h, yd + h + .18, z - .09, z + .09, 'S_oak', omit=())
    for x in (-1.05, -.35, .35, 1.05):
        obox(nm('pr'), x - .05, x + .05, yd + h + .18, yd + h + .3, -6.62, -1.38, 'S_oak', omit=('-y',))
    yt = yd + h + .34
    top, under = [], []
    for k in range(16):
        x = -1.4 + 2.8 * ((k * .618) % 1.0); z = -6.5 + 5.0 * (k + .5) / 16
        top.append((Vector((x, yt + rng.uniform(0, .12), z)), Vector((rng.uniform(-.3, .3), 1, rng.uniform(-.3, .3))), rng.uniform(.55, .72),
                    rng.uniform(0, 6.28), _uvwin(rng, .5), 1.0))
    leaf_clusters('pv', [t for i, t in enumerate(top) if i % 3], 'X_foliage', (0, yt - 1.2, -4.0), blend=.6, npts=6)
    leaf_clusters('pvw', [t for i, t in enumerate(top) if i % 3 == 0], 'X_wisteria', (0, yt - 1.2, -4.0), blend=.6, npts=6)
    for k in range(3):
        x = -1.1 + 2.2 * k / 2 + rng.uniform(-.15, .15); z = rng.uniform(-6.0, -2.0)
        for f in (1, -1):
            under.append((Vector((x, yt - .45, z + f * .02)), Vector((0, -.1, f)), rng.uniform(.13, .16), math.pi / 2,
                          (rng.uniform(.05, .55), .2, .4), 2.3))
    leaf_clusters('pvr', under, 'X_wisteria', (0, yt + 1.0, -4.0), blend=.3, npts=5, inner=.75)
    # S3 (L2: the West Arm's wisteria walk stands this frame on a court's floor, LOOKED from under it:
    # bare beams -- the canopy's clusters face the sky, single-sided, as a roof terrace is only seen
    # from above). The canopy's underside: the same clusters a hand's breadth lower, facing down
    # (every other cluster, broader and five-pointed: the pergola is always drawn, so its triangles are
    # every roof terrace's LOD1 too -- the per-house LOD ratio, MEASURED, holds at 40 more and not 96)
    leaf_clusters('pvu', [(P - Vector((0, .09, 0)), Vector((-n.x, -1, -n.z)), sz * 1.25, rot, uv, st) for (P, n, sz, rot, uv, st) in top[::2]],
                  'X_foliage', (0, yt + 1.2, -4.0), blend=.6, npts=5)
    stem_strip([(-px, yd, -1.45), (-px + .04, yd + .9, -1.47), (-px - .03, yd + 1.7, -1.45), (-px + .02, yd + h, -1.46)], .08, 'R_bark', facing=(0, 0, 1))


def altana():
    """A roof terrace (altana) astride a hip roof's ridge: a timber deck on posts, a
    slatted rail and a small tiled canopy -- where the academy's scholars read the sky.
    Origin: the bay's facade origin at the eave datum."""
    zc = -D / 2; yd = YR + .55; hx, hz = 1.7, 1.6
    # (bytes: MOONMERE.md's 30 KB -- the posts and rails lose their buried ends, the slatted
    # rail is the painted balustrade both ways, as every always-drawn rail is)
    obox(nm('adk'), -hx, hx, yd - .16, yd, zc - hz, zc + hz, 'Timber', omit=())
    for x in (-hx + .2, hx - .2):
        for z in (zc - hz + .2, zc + hz - .2):
            obox(nm('aps'), x - .09, x + .09, yd - 1.6, yd - .16, z - .09, z + .09, 'Timber', omit=('-y', '+y'))
            obox(nm('apu'), x - .07, x + .07, yd, yd + 2.06, z - .07, z + .07, 'Timber', omit=('-y', '+y'))
    rect_course(hx - .03, hz - .03, .03, yd + .9, yd + .98, 'Timber', top_in=-.03, bot_in=-.03, cz=zc)
    for k, M in enumerate(face_frames(0, zc, 0)):
        h_ = hx if k % 2 == 0 else hz
        d_ = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, d_ - .02)):
            card(nm('abal'), -h_, h_, yd, yd + .9, 0, 'X_balus', back=True)
    yc = yd + 2.2
    box(nm('apl'), -hx - .1, hx + .1, yc - .14, yc, zc - hz - .1, zc + hz + .1, 'Timber')
    pc = math.tan(math.radians(24))
    ap = (0, yc + .2 + pc * (hz + .5), zc)
    c = [(-hx - .5, yc + .05, zc + hz + .5), (hx + .5, yc + .05, zc + hz + .5), (hx + .5, yc + .05, zc - hz - .5), (-hx - .5, yc + .05, zc - hz - .5)]
    rr = (ap[0] + .2, ap[1], ap[2]); rl = (ap[0] - .2, ap[1], ap[2])
    roof_plane([c[0], c[1], rr, rl], (1, 0, 0), Vector((0, 1, pc)))
    roof_plane([c[2], c[3], rl, rr], (-1, 0, 0), Vector((0, 1, -pc)))
    pe = (ap[1] - c[0][1]) / (hx + .5 - .2)
    roof_plane([c[3], c[0], rl], (0, 0, 1), Vector((-pe, 1, 0)))
    roof_plane([c[1], c[2], rr], (0, 0, -1), Vector((pe, 1, 0)))
    eave_edge(c[0], c[1], (0, 0, 1), yc + .05, .5, fascia=.16, mitre=True)
    eave_edge(c[2], c[3], (0, 0, -1), yc + .05, .5, fascia=.16, mitre=True)
    eave_edge(c[3], c[0], (-1, 0, 0), yc + .05, .5, fascia=.16, mitre=True)
    eave_edge(c[1], c[2], (1, 0, 0), yc + .05, .5, fascia=.16, mitre=True)


def chimney():
    """A tufa stack with a basalt band and a tiled hood (untinted: no tint class). Always
    drawn: its faces only, on flat swatches where a strip would slice it."""
    obox(nm('cs'), -.45, .45, -.4, 2.0, -.3, .3, 'Tufa', omit=('-y', '+y'))
    obox(nm('cb'), -.5, .5, 2.0, 2.24, -.35, .35, 'S_iron', omit=('+y',))
    obox(nm('cs2'), -.45, .45, 2.24, 2.6, -.3, .3, 'Tufa', omit=('-y', '+y'))
    obox(nm('cc'), -.55, .55, 2.6, 2.72, -.4, .4, 'S_pale_s', omit=())
    for x in (-.25, .25):
        obox(nm('cp'), x - .1, x + .1, 2.72, 3.0, -.1, .1, 'S_pale_s', omit=('-y',))
    quad(nm('ch'), [(-.6, 3.0, .45), (.6, 3.0, .45), (.6, 3.3, 0), (-.6, 3.3, 0)], 'S_tile', (0, 1, 1))
    quad(nm('ch'), [(.6, 3.0, -.45), (-.6, 3.0, -.45), (-.6, 3.3, 0), (.6, 3.3, 0)], 'S_tile', (0, 1, -1))


def cap_turret():
    """The stair turret's own cap (MOONMERE.md: the mock-up stretched roof_run 0.5x): a
    bracketed eave ring, a glazed cone and a finial. Origin: the turret's axis at its top."""
    r = 1.0
    lathe(nm('tfa'), [(r + .6, -.04, True), (r + .6, .12, True)], 'S_oak', seg=10, caps=False)
    lathe(nm('tsof'), [(r - .02, -.04, False), (r + .6, -.04, False)], 'R_eave_band', seg=10, caps=False)
    lathe(nm('cone'), [(r + .64, .1, True), (0.0, 2.4, False)], 'Pantile', seg=10, caps=False)
    lathe(nm('fin'), [(.06, 2.3, True), (.12, 2.8, True), (0, 3.05, False)], 'S_brass_p', seg=4)


def eave_brk():
    """The LOD0-only third of the split eave (MOONMERE.md): the 3D brackets every metre
    and the glazed roll ends along both eaves of a 4 m slice. Shadowless (the kit's
    shadowless list); at 45 m only this relief swaps for the slice's painted soffit."""
    # the contract's 20 KB: the brackets on the walnut SWATCH (the strip sliced each at its 1 m
    # tile line), the rolls 2.5 a metre with two facets
    for x in (-1.5, -.5, .5, 1.5):
        bracket(x, YE - .24, 0, OVH * .97, surf='S_hull')
        bracket(x, YE - .24, -D, OVH * .97, dirn=-1, surf='S_hull')
    roll_ends(-2, 2, OVH, YE, 1, n_per_m=2.5)
    roll_ends(-2, 2, -D - OVH, YE, -1, n_per_m=2.5)


# ====================================================================== half bays
def half_turret():
    """A half-bay (2 m) stair turret: half-round below the eaves, full round above, slit
    windows climbing with the stair; cap_turret sits on its top (TURRET_TOP)."""
    r = 1.0; top = TURRET_TOP
    seg = 4 if far() else 14
    if far():
        lathe(nm('ts'), [(r + .1, -POD, True), (r, 11.4, True)], 'Tufa', seg=seg, a0=0, a1=math.pi, caps=False)
    else:
        lathe(nm('tb'), [(r + .14, -POD, True), (r + .14, 0, True), (r, 1.2, True)], 'Basalt', seg=seg, a0=0, a1=math.pi, caps=False)
        lathe(nm('ts'), [(r, 1.2, True), (r, 11.4, True)], 'Tufa', seg=seg, a0=0, a1=math.pi, caps=False)
    lathe(nm('tt'), [(r, 11.4, True), (r, top, True)], 'Tufa', seg=seg, caps=False)
    if not far():
        for y in (4.7, 8.3):
            lathe(nm('tbd'), [(r + .05, y, True), (r + .05, y + .22, True)], 'Basalt', seg=seg, caps=False, a0=0, a1=math.pi)
        lathe(nm('tbd'), [(r + .05, 11.9, True), (r + .05, 12.12, True)], 'Basalt', seg=seg, caps=False)
        lathe(nm('tbd'), [(r + .1, 1.14, True), (r + .1, 1.26, True)], 'Pale', seg=seg, a0=0, a1=math.pi, caps=False)
        for k, (y, ang) in enumerate([(2.6, 1.2), (5.6, 1.9), (8.9, 1.25), (12.4, 1.95)]):
            with G.at(M=RY(math.pi / 2 - ang)):
                box(nm('slit'), -.09, .09, y, y + .9, r - .04, r + .015, 'GlassHigh')
                box(nm('slt'), -.2, .2, y + .9, y + 1.02, r - .05, r + .07, 'Pale')
        mount('lamp', 0, 3.6, r, yaw=0.0)
    else:
        lathe(nm('tbd'), [(r + .02, 11.9, True), (r + .02, 12.12, True)], 'Basalt', seg=seg, caps=False)
    # the 2 m slot's own face either side of the round (against the house's eave)
    for xa, xb in ((-1.0, -1.0), (1.0, 1.0)):
        pass
    pbox(nm('tplate'), -1.05, 1.05, top - .25, top, -.05, .06, 'Timber', lean='front' if far() else None)


def half_postern():
    """A half-bay (2 m): a narrow gate through a 0.7 m banded garden wall, a tiled coping."""
    t = .7; top = 4.4
    Hp = hole(-.5, .5, 0, 2.05, .45, 8)
    wall(-1, 1, -POD, top, 'Tufa', [Hp], z=0)
    if not far():
        wall(-1, 1, -POD, top, 'Tufa', [Hp], z=-t, facing=-1)
    reveal(Hp, 0, t, 'TufaS', sill=False, head_from=0 if far() else -.2, head_to=-t if far() else -t + .2)
    quad(nm('pf'), [(-.5, .02, 0), (.5, .02, 0), (.5, .02, -t), (-.5, .02, -t)], 'Pale', (0, 1, 0))
    voussoirs(Hp, .3, .06, -.2, n=7)
    if not far():
        with G.at(z=-t):
            with G.at(M=RY(math.pi)):
                voussoirs(Hp, .3, .06, -.2, n=7)
        for z0, z1 in ((0, .2), (-t - .2, -t)):
            for xa, xb in ((-1, -.5), (.5, 1)):          # the plinth either side of the gate, never across it
                box(nm('pp'), xa, xb, -POD, .55, z0, z1, 'Basalt')
    pbox(nm('pb'), -1, 1, 2.9, 3.12, -t - .05, .05, 'Basalt', lean='front' if far() else None)
    quad(nm('cop'), [(-1.05, top - .05, .15), (1.05, top - .05, .15), (1.05, top + .3, -t / 2), (-1.05, top + .3, -t / 2)], 'Pantile', (0, 1, 1))
    quad(nm('cop'), [(1.05, top - .05, -t - .15), (-1.05, top - .05, -t - .15), (-1.05, top + .3, -t / 2), (1.05, top + .3, -t / 2)], 'Pantile', (0, 1, -1))
    if not far(): box(nm('ridge'), -1.05, 1.05, top + .26, top + .38, -t / 2 - .08, -t / 2 + .08, 'Ridge')
    mount('door', 0, 0, -.35, axes=[1.0 / DOOR_W, 2.5 / DOOR_H, 1])
    mount('lamp', .8, 2.6, 0)


# ====================================================================== corners and returns
def corner_quoin():
    """Banded quoins for a row's +x FRONT corner (front arm along -x, side arm along -z),
    12 m (stretch y for other ranks). The -x corner takes yaw - pi/2. Near only.

    Only the faces that stand proud of the two walls (0.045): each course's front and side
    faces, the arms' ends, and the strips of top and underside the next / last course leaves
    bare (long and short arms alternate). Review 2026-10-06: two whole boxes a course
    overlapped in the corner (coplanar, and 49 KB against the contract's 40)."""
    e = .045
    cs = []
    y = 1.2; i = 0
    while y < 12.0 - .05:
        long_ = i % 2 == 0
        a, b = (.62, .3) if long_ else (.3, .62)
        cs.append((y, y + .44, a, b, 'Pale' if long_ else 'Basalt'))
        y += .44; i += 1
    for surf in ('Pale', 'Basalt'):
        vs, fs, ns = [], [], []

        def q(pts, n):
            k = len(vs); vs.extend(pts); fs.append(tuple(range(k, k + len(pts)))); ns.append(Vector(n))
        for ci, (y0, y1, a, b, sf) in enumerate(cs):
            if sf != surf: continue
            q([(-a, y0, e), (e, y0, e), (e, y1, e), (-a, y1, e)], (0, 0, 1))          # front
            q([(e, y0, e), (e, y0, -b), (e, y1, -b), (e, y1, e)], (1, 0, 0))          # side
            q([(-a, y0, 0), (-a, y0, e), (-a, y1, e), (-a, y1, 0)], (-1, 0, 0))       # the front arm's end
            q([(0, y0, -b), (e, y0, -b), (e, y1, -b), (0, y1, -b)], (0, 0, -1))       # the side arm's end
            for yy, other, nrm in ((y1, cs[ci + 1] if ci + 1 < len(cs) else None, 1), (y0, cs[ci - 1] if ci else None, -1)):
                a2, b2 = (other[2], other[3]) if other else (0.0, 0.0)
                if a > a2 + 1e-6:
                    q([(-a, yy, 0), (-a2, yy, 0), (-a2, yy, e), (-a, yy, e)], (0, nrm, 0))
                if b > b2 + 1e-6:
                    q([(0, yy, -b), (0, yy, -b2), (e, yy, -b2), (e, yy, -b)], (0, nrm, 0))
                if not other:
                    q([(-min(a, .0), yy, 0), (e, yy, 0), (e, yy, e), (0, yy, e)], (0, nrm, 0))   # the corner square itself
        if fs: mesh(nm('quoin'), vs, fs, surf, normals2=ns)


def ret(height, low=False):
    """A row's END WALL (ret_flank 12 m, ret_low 7.2 m). Origin: the end face's centre at
    the ground, the face on the plane x = 0 facing +x, the body's depth along z (-4.5 ..
    4.5, built for 9.0, stretched in z to 8.0 / 8.5). Symmetric, so the -x end of a row
    takes the house's yaw + pi."""
    hw = D / 2
    with G.at(M=RY(math.pi / 2)):
        # in this frame the face is z = 0 facing +z, x runs -hw..hw (x = -world z)
        if far():
            quad(nm('rp'), [(-hw, -POD, .1), (hw, -POD, .1), (hw, 1.2 if not low else .4, .1), (-hw, 1.2 if not low else .4, .1)], 'Basalt', (0, 0, 1))
            quad(nm('rw'), [(-hw, 1.2 if not low else .4, 0), (hw, 1.2 if not low else .4, 0), (hw, height, 0), (-hw, height, 0)], 'Tufa' if not low else 'Lime', (0, 0, 1))
            for y in ((4.8, 8.4) if not low else (3.6,)):
                quad(nm('rb'), [(-hw, y - .12, .03), (hw, y - .12, .03), (hw, y + .12, .03), (-hw, y + .12, .03)], 'Basalt', (0, 0, 1))
            wins = [(-2.2, 5.45, .9, 1.9), (2.2, 5.45, .9, 1.9), (-2.2, 9.15, .8, 1.3), (2.2, 9.15, .8, 1.3)] if not low else \
                [(-2.2, 4.4, .8, 1.5), (2.2, 4.4, .8, 1.5)]
            for x, sl, w, h in wins:
                # dark panes on a stone swatch: one material, the contract's 4 KB (a second
                # primitive's JSON alone cost a kilobyte)
                quad(nm('rgw'), [(x - w / 2, sl, .02), (x + w / 2, sl, .02), (x + w / 2, sl + h, .02), (x - w / 2, sl + h, .02)], 'S_dark', (0, 0, 1))
            return
        if not low:
            plinth(-hw, hw)
            h1 = [window(0, 2.9, .7, 1.0, 'GlassHigh', d=.32, lintel='Basalt', sill_slab=False, grille=True)]
            # A-7 (the look review: "end walls are large blank planes ... three small windows on
            # a 15 m wall"): a BLIND ARCADE either side of the grille, two shallow banded arches
            # in the ground storey, and a painted SUNDIAL between the upper windows
            if d0():
                for x in (-2.6, 2.6):
                    Hb = hole(x - .75, x + .75, 1.5, 3.4, .55, 8); h1.append(Hb)
                    reveal(Hb, 0, .14, 'TufaS', sill=False); infill(Hb, -.14, 'TufaS')
                    voussoirs(Hb, .26, .04, -.1, n=9, surfs=('Pale', 'Basalt'))
            wall(-hw, hw, 1.2, 4.8, 'Tufa', h1)
            h2 = [window(x, 5.45, .9, 1.9, 'GlassTallD' if x < 0 else 'GlassTall', lintel='Basalt', shutters=True) for x in (-2.2, 2.2)]
            rule(4.8, x0=-hw, x1=hw, holes=h2)
            wall(-hw, hw, 4.8, 8.4, 'Tufa', h2)
            h3 = [window(x, 9.15, .8, 1.3, 'GlassSq', lintel='Basalt') for x in (-2.2, 2.2)]
            rule(8.4, x0=-hw, x1=hw, holes=h3)
            wall(-hw, hw, 8.4, height - .3, 'Tufa', h3)
            box(nm('rpl'), -hw, hw, height - .3, height, -.1, .1, 'Timber')
            mount('lamp', 0, 3.9, 0)
            mount('vine', -3.6, 0, .05)
            if d0(): sundial(0, 6.75, .62)
        else:
            wall(-hw, hw, -POD, .3, 'Basalt')
            h1 = [window(0, 1.5, .7, 1.2, 'GlassHigh', d=.3, lintel='Pale', sill_slab=False, grille=True)]
            wall(-hw, hw, .3, 3.6, 'Lime', h1)
            band(3.54, .12, x0=-hw, x1=hw)
            h2 = [window(x, 4.4, .8, 1.5, 'GlassTallD', lintel='Pale') for x in (-2.2, 2.2)]
            wall(-hw, hw, 3.6, height - .25, 'Lime', h2)
            box(nm('rcor'), -hw, hw, height - .25, height, -.08, .16, 'Pale')
            mount('vine', -2.8, 0, .05)
            if d0(): sundial(0, 4.95, .45)


def sundial(cx, cy, r):
    """A-7: a painted sundial on a plain end wall -- a pale disc in a basalt ring, its hour
    lines, an iron gnomon -- the town's clocks are its walls."""
    lathe(nm('sdd'), [(0, 0, False), (r, 0, True), (r, .03, True), (0, .03, False)], 'S_lime_s', seg=12, M=T(cx, cy, .0) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    lathe(nm('sdr'), [(r, -.01, True), (r + .08, -.01, True), (r + .08, .05, True), (r, .05, True)], 'Basalt', seg=12, M=T(cx, cy, .0) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
    for k in range(7):
        a = math.pi * (k / 6) - math.pi / 2 - math.pi / 2
        x1, y1 = cx + math.cos(a + math.pi / 2) * r * .9, cy - abs(math.sin(a + math.pi / 2)) * r * .9
        dx, dy = x1 - cx, y1 - cy; L_ = math.hypot(dx, dy); nx_, ny_ = -dy / L_ * .012, dx / L_ * .012
        quad(nm('sdl'), [(cx + nx_, cy + ny_, .04), (x1 + nx_, y1 + ny_, .04), (x1 - nx_, y1 - ny_, .04), (cx - nx_, cy - ny_, .04)], 'S_dark', (0, 0, 1))
    prism(nm('sdg'), [(0, 0), (.0, -r * .1), (r * .55, -r * .02)], -.012, .012, 'S_iron', M=T(cx, cy, .04) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))


# ====================================================================== LOD2 cards
def card_file(slot, top, w=4.0):
    """One quad of the rank's painted elevation, from the podium (-2.4) to the eave."""
    y0 = A.ELEV['y0m']
    pxm = A.ELEV['pxmOf'].get(slot, A.ELEV['pxm'])
    hm = A.ELEV['h'] / pxm
    card(nm('card'), -w / 2, w / 2, y0, top, 0.0, 'Elev_' + slot, 0, 1, 0, (top - y0) / hm)


def card_tower():
    """The study towers' LOD2: four faces of the painted tower elevation (8 triangles)."""
    pxm = A.ELEV['pxmOf']['tower']; hm = A.ELEV['h'] / pxm; top = 22.8
    for k in range(4):
        with G.at(M=RY(k * math.pi / 2) @ T(0, 0, 4.0)):
            card(nm('ct'), -4, 4, 0, top, 0, 'Elev_tower', 0, 1, 0, top / hm)


# ====================================================================== joinery (tint pools)
def shutters_pair():
    """Two louvred leaves folded back either side of a 1.0 x 2.0 window (stretched by the
    mount's axes). Painted neutral: each house tints them (MOONMERE.md joinery colours)."""
    for s in (-1, 1):
        x0 = s * .53
        with G.at(M=T(x0, 0, .03) @ RY(s * math.radians(-12))):
            xa, xb = (0, .52) if s > 0 else (-.52, 0)
            quad(nm('shf'), [(xa, .02, .0), (xb, .02, 0), (xb, 1.98, 0), (xa, 1.98, 0)], 'R_shutter', (0, 0, 1))
            quad(nm('shb'), [(xb, .02, -.03), (xa, .02, -.03), (xa, 1.98, -.03), (xb, 1.98, -.03)], 'R_shutter', (0, 0, -1))
            xe = xa if s < 0 else xb
            q = [(xe, .02, 0), (xe, .02, -.03), (xe, 1.98, -.03), (xe, 1.98, 0)]
            quad(nm('she'), q if s > 0 else q[::-1], 'R_shutter', (s, 0, 0))


def door_leaf():
    """A studded double door filling the 1.4 x 2.6 datum door (stretched by the mount's
    axes), its face at z = 0, a threshold. Neutral light oak, tinted per house."""
    quad(nm('dl'), [(-.7, 0, 0), (.7, 0, 0), (.7, DOOR_H, 0), (-.7, DOOR_H, 0)], 'R_door', (0, 0, 1))
    box(nm('thr'), -.74, .74, -.02, .04, -.04, .1, 'R_door')


# ====================================================================== study towers
def face_frames(cx, cz, half):
    """Four frames whose z = 0 plane is each face of a square of half-width `half` centred
    on (cx, cz): front (+z) first, then +x, back, -x."""
    return [T(cx, 0, cz) @ RY(k * math.pi / 2) @ T(0, 0, half) for k in range(4)]


def quoins(x, y0, y1, s, step=.45, wrap=True, force=False):
    """Banded quoins at a face's edge x (s = -1: its left edge). With wrap (the default) only
    the LEFT edge draws, as one L-block per course round the corner onto the face before
    it (rotation-only frames: that face runs along -z here), so each corner is laid once;
    the faces buried in the walls are never drawn."""
    if not (d0() or (force and DET == 1)): return
    if wrap and s > 0: return
    y = y0; i = 0
    while y < y1 - .05:
        # A-7 (the look review: "pale stepped quoin blocks protrude irregularly and read as
        # stacked boxes"): the long stones stood 0.065 proud (more than the bands they cross),
        # a staircase of pale boxes up every corner; they now stand 0.03, the bands' line
        # carrying on over them, so a corner reads as one banded strip. The short courses
        # still lie flush (drawing them too cost 44 KB a study tower, MEASURED)
        if i % 2 and (DET == 1 or step < .6):
            y += step; i += 1; continue
        w, w2 = (.55, .32) if i % 2 == 0 else (.32, .55)
        y1_ = min(y1, y + step); surf = 'Pale' if i % 2 == 0 else 'Basalt'
        if not wrap:
            xa, xb = (x, x + w) if s < 0 else (x - w, x)
            pbox(nm('q'), xa, xb, y, y1_, -.08, .03, surf)
        else:
            e = .03           # one projection, under the bands' 0.05 (the bands run on over them)
            poly = [(x - e, e), (x + w, e), (x + w, 0), (x, 0), (x, -w2), (x - e, -w2)]
            vs = [(px, y, pz) for px, pz in poly] + [(px, y1_, pz) for px, pz in poly]
            fs = [(6, 7, 8, 9, 10, 11)[::-1], (0, 1, 7, 6), (5, 0, 6, 11)]
            ns = [Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))]
            mesh(nm('q'), vs, fs, surf, normals2=ns)
        y += step; i += 1


def louvre_opening(x0, x1, y0, y1, surf, z=0.0, d=.35, slats=True):
    Ho = hole(x0, x1, y0, y1, 0, 1)
    reveal(Ho, z, d, 'S_hull' if far() else 'TimberD')        # LOD1: a walnut swatch, never tile-sliced
    infill(Ho, z - d, surf)
    if slats and d0():
        louvre_slats(x0, x1, y0, y1, z - d, z - .06, 9, 'Timber', open_=True)
    return Ho


def louvre_slats(x0, x1, y0, y1, zb, zf, n, surf, open_=True, cuts=()):
    """n slats as ONE sawtooth sheet: each slat's sloping face and its nose (the faces you
    can see; the ends die in the reveal). open_: tipped to show the dark between them;
    shut: closed, overlapping. cuts: [(xa, xb, ya, yb)] gaps (the telescopes)."""
    pitch = (y1 - y0) / n
    vs, fs, ns = [], [], []
    for k in range(n):
        yb = y0 + k * pitch
        if open_:
            a, b = (zb + .02, yb + pitch * .3), (zf, yb + pitch * .95)
        else:
            a, b = (zb, yb + .01), (zf, yb + pitch * .45)
        top = (zf, yb + pitch) if not open_ else (zf - .04, yb + pitch)
        xs = [(x0, x1)]
        for (ca, cb, cy0, cy1) in cuts:
            if cy0 < yb + pitch and cy1 > yb:
                xs = [seg for xa_, xb_ in xs for seg in ((xa_, min(xb_, ca)), (max(xa_, cb), xb_)) if seg[1] - seg[0] > .05]
        for xa_, xb_ in xs:
            q = len(vs)
            vs += [(xa_, a[1], a[0]), (xb_, a[1], a[0]), (xb_, b[1], b[0]), (xa_, b[1], b[0])]
            fs.append((q, q + 1, q + 2, q + 3)); ns.append(Vector((0, -(b[0] - a[0]), (b[1] - a[1]))).normalized() * -1 if False else Vector((0, -1, 1)).normalized())
            q = len(vs)
            vs += [(xa_, b[1], b[0]), (xb_, b[1], b[0]), (xb_, top[1], top[0]), (xa_, top[1], top[0])]
            fs.append((q, q + 1, q + 2, q + 3)); ns.append(Vector((0, .3, 1)).normalized())
    if fs: mesh(nm('slats'), vs, fs, surf, normals2=ns)


def tower(kind):
    """A square study tower, 8 x 8, six storeys on a 1.2 m plinth (MOONMERE.md "Study
    towers"): a battered basalt plinth, a banded tufa shaft with quoins and one window a
    storey, and a LOUVRED TOP ROOM (MM-1) whose louvres stand OPEN by day -- the Long
    Tower's are the only ones shut. tower_a: a walnut louvre room under the hipped cap;
    tower_b: a taller, narrower room on a corbelled gallery under a steep cap. The cap is
    its own skyline pool (cap_tower, glaze-tinted), at the mount 'cap'."""
    hw = 4.0; R0 = 19.2
    E = 22.8 if kind == 'a' else 23.6
    for k, M in enumerate(face_frames(0, 0, hw)):
        with G.at(M=M):
            plinth(-hw, hw, 1.2, gaps=[(-.72, .72)] if k == 0 else ())
            hs1 = []
            if k == 0:
                hs1.append(door(0, w=1.3, floor=1.2, h=2.5, recess=.8))
            else:
                hs1.append(window(0, 2.6, .5, 1.0, 'GlassHigh', d=.3, lintel='Basalt', sill_slab=False))
            wall(-hw, hw, 1.2, 4.8, 'Tufa', hs1)
            for s_ in range(1, 4 + 1):
                y0 = 1.2 + 3.6 * s_; y1 = y0 + 3.6
                x = (-1.4 if (s_ + k) % 2 else 1.4)
                hs = [window(x, y0 + 1.0, .85, 1.7, 'GlassTall' if (s_ + k) % 2 else 'GlassTallD', lintel='Basalt', shutters=False)]
                band(y0 - .12, .24, x0=-hw, x1=hw)
                if not FLATWIN: wall(-hw, hw, y0, min(y1, R0), 'Tufa', hs)
            if FLATWIN:
                # LOD1: the windows are painted on, so the shaft is ONE wall cut only at its tile
                # lines (per-storey walls added a cut at every storey: the contract's 50 KB)
                wall(-hw, hw, 4.8, R0, 'Tufa')
            quoins(-hw, 1.2, R0, -1); quoins(hw, 1.2, R0, 1)
            if kind == 'a':
                wall(-hw, hw, R0 + .3, E - .3, 'Tufa', [hole(-3.4, -.2, R0 + .55, E - .55, 0, 1), hole(.2, 3.4, R0 + .55, E - .55, 0, 1)])
                louvre_opening(-3.4, -.2, R0 + .55, E - .55, 'R_louvre')
                louvre_opening(.2, 3.4, R0 + .55, E - .55, 'R_louvre')
                pbox(nm('lpost'), -.2, .2, R0 + .55, E - .55, -.35, .04, 'S_hull' if far() else 'Timber', keep=(4,))
                if d0():
                    for bx in (-3.0, -1.0, 1.0, 3.0):
                        bracket(bx, E + YE - .24, 0, TOVH * .97)
            else:
                # the corbel table (rings, below) and the gallery round a 6 x 6 room
                if not far():
                    for cx in (-2.6, 0.0, 2.6):
                        prism(nm('cr'), [(0, R0 - 1.4), (.18, R0 - 1.4), (.18, R0 - .9), (.38, R0 - .9), (.38, R0 - .5), (0, R0 - .5)], cx - .25, cx + .25, 'Pale', axis='x')
                    box(nm('grail'), -hw - .55, hw + .55, R0 + 1.25, R0 + 1.35, .43, .55, 'Timber')
                    if d0():
                        palings(-hw - .5, hw + .5, R0 + .35, R0 + 1.25, .45, 17, .08, 'Timber', sides=False)
                    else:
                        card(nm('gbal'), -hw - .5, hw + .5, R0 + .35, R0 + 1.25, .5, 'X_balus', back=True)
                with G.at(z=-1.0):
                    wall(-3, 3, R0 + .35, E - .3, 'Tufa', [hole(-2.6, -.15, R0 + .6, E - .55, 0, 1), hole(.15, 2.6, R0 + .6, E - .55, 0, 1)])
                    louvre_opening(-2.6, -.15, R0 + .6, E - .55, 'R_louvre')
                    louvre_opening(.15, 2.6, R0 + .6, E - .55, 'R_louvre')
                    pbox(nm('lpost'), -.15, .15, R0 + .6, E - .55, -.35, .04, 'S_hull' if far() else 'Timber', keep=(4,))
                quad(nm('gdeck'), [(-hw - .55, R0 + .35, .55), (hw + .55, R0 + .35, .55), (hw - 1, R0 + .35, -1), (-hw + 1, R0 + .35, -1)], 'Pale', (0, 1, 0))
            if k == 0: mount('lamp', 1.2, 3.8, 0)
    if kind == 'a':
        ring_course(hw, hw + .22, R0, R0 + .3, 'Pale', top_in=hw)
        ring_course(hw, hw + .1, E - .3, E, 'Timber', top=False, bottom=not far())
    else:
        # three corbel courses: each top only where the next does not cover it, the last one's
        # top IS the gallery deck (gdeck), so it has none
        cs = ((R0 - .5, R0 - .2, .15, 'Pale'), (R0 - .2, R0 + .1, .32, 'Basalt'), (R0 + .1, R0 + .35, .55, 'Pale'))
        for i, (ya, yb_, out, sf) in enumerate(cs):
            nxt = cs[i + 1][2] if i + 1 < len(cs) else None
            prv = cs[i - 1][2] if i else 0.0
            ring_course(hw, hw + out, ya, yb_, sf, top_in=hw + nxt if nxt else hw, bot_in=hw + prv, top=nxt is not None)
        ring_course(3.0, 3.1, E - .3, E, 'Timber', top=False, bottom=not far())
    # the room's ceiling seen through the open louvres
    yc = E - .32 if kind == 'a' else E - .32
    hc = hw - .4 if kind == 'a' else 2.6
    quad(nm('ceil'), [(-hc, yc, hc), (hc, yc, hc), (hc, yc, -hc), (-hc, yc, -hc)], 'S_hull' if far() else 'TimberD', (0, -1, 0))
    quad(nm('rfl'), [(-hc, R0 + .3, -hc), (hc, R0 + .3, -hc), (hc, R0 + .3, hc), (-hc, R0 + .3, hc)], 'Pale', (0, 1, 0))
    if kind == 'a' and d0():
        # a reading desk and a brass orrery in the open room, seen against the sky
        box(nm('desk'), -1.0, 1.0, R0 + 1.05, R0 + 1.15, -.5, .5, 'S_oak')
        lathe(nm('orr'), [(0, R0 + 1.15, False), (.3, R0 + 1.4, True), (0, R0 + 1.7, False)], 'S_brass_p', seg=6)
    mount('cap', 0, E, 0, axes=[1, 1, 1] if kind == 'a' else [1, 1.45, 1])


def tower_l1(kind):
    """The study tower's LOD1: the shaft's windows painted on (FLATWIN), the door and the
    LOUVRE ROOM kept as openings (the mock-up's tower_l1 painted the room flat: the
    review's outline violation), no slats, no quoins, no brackets."""
    global FLATWIN
    FLATWIN = True
    try: tower(kind)
    finally: FLATWIN = False


def cap_tower():
    """A study tower's hipped cap over the 8 x 8 shaft, 1.2 m overhang, 20 deg, hip rolls,
    a brass-painted finial (glaze-tinted). tower_b places it stretched 1.45 in y (its
    steep pavilion). Origin: the tower's axis at its eave datum (the tower's 'cap' mount)."""
    o = TOVH; h = 4.0 + o; pp = math.tan(math.radians(20))
    ap = (0, YE + pp * h, 0)
    c = [(-h, YE, h), (h, YE, h), (h, YE, -h), (-h, YE, -h)]
    for k in range(4):
        a, b = c[k], c[(k + 1) % 4]
        mid = Vector(((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2)).normalized()
        e = Vector(b) - Vector(a)
        n = Vector((mid.x * pp, 1, mid.z * pp))
        roof_plane([a, b, ap], e.normalized(), n)
        tube(a, ap, .12, (0, 1, 0), seg=3, close=True)        # closed: a tall roof is seen from below
        eave_edge(a, b, (mid.x, 0, mid.z), YE, o, mitre=True)
    lathe(nm('fin'), [(.1, ap[1] - .1, True), (.1, ap[1] + .5, True), (.2, ap[1] + .65, True), (.06, ap[1] + .9, True), (0, ap[1] + 1.4, False)], 'S_brass_p', seg=6)


# ====================================================================== the Long Tower (MM-1)
LT = {'hw': 6.0, 'base': 7.8, 'R0': 21.2, 'rb': 22.2, 'over': .6, 'E': 30.4, 'pitch': 32.0,
      'floors': [.6, 4.2, 7.8, 11.4, 15.0, 18.6]}
# the four telescopes, on the front (east) face of the sealed room: (x, y where they pass the slats)
# LOOK PASS M2 (2026-10-06: "the four telescopes poke straight out of the louvres"): they stand
# in an even row, each through its own framed port, resting in iron yokes on a timber
# observing ledge -- instruments set up and left, all parallel, aimed steeply at one point of sky
LT_TELES = [(-4.15, 24.95), (-1.75, 24.95), (1.75, 24.95), (4.15, 24.95)]
LT_DIR = Vector((-.16, math.sin(math.radians(36)), math.cos(math.radians(36)))).normalized()
LT_LEDGE = 24.25          # the ledge's top (local y)


def lt_far():
    """lt_shell_l1 (beyond 140 m; MOONMERE.md: <= 25% of lt_shell): the battered base, the
    shaft as ONE projected quad a face (its painted elevation, elev_ltshaft), the corbelled
    sealed room with its painted-over louvres (black at night), the dark cap, the finial and
    one armillary ring, the observing gallery and its instruments as thin prisms (A-7), the loggia as a painted arcade."""
    hw = LT['hw']; base = LT['base']; R0 = LT['R0']; rb = LT['rb']; E = LT['E']; hw2 = hw + LT['over']
    for k, M in enumerate(face_frames(0, 0, hw)):
        with G.at(M=M):
            quad(nm('b'), [(-hw - .45, -POD, .45), (hw + .45, -POD, .45), (hw, base + .3, 0), (-hw, base + .3, 0)], 'Basalt', (0, .06, 1))
            card(nm('sh'), -hw, hw, base + .3, R0, 0, 'Elev_ltshaft')
            quad(nm('cb'), [(-hw, R0, 0), (hw, R0, 0), (hw2, rb, .6), (-hw2, rb, .6)], 'Pale', (0, -.5, 1))
    for k, M in enumerate(face_frames(0, 0, hw2)):
        with G.at(M=M):
            quad(nm('rm'), [(-hw2, rb, 0), (hw2, rb, 0), (hw2, E, 0), (-hw2, E, 0)], 'R_louvre_shut', (0, 0, 1))
            if k == 0:
                # (A-7) the observing gallery as one slab and its three instruments as thin prisms
                pbox(nm('gdk'), -hw2 + .5, hw2 - .5, LT_LEDGE - .14, LT_LEDGE, -.3, 1.4, 'S_hull')
                for nm_, ((px, pz), (yaw, el), L, r) in LT_INSTR.items():
                    d = lt_aim(yaw, el)
                    P = Vector((px, LT_LEDGE + (1.42 if nm_ == 'refractor' else .95 if nm_ == 'transit' else 1.25), pz)) - d * (L * .45)
                    q = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
                    with G.at(M=T(*P) @ q):
                        pbox(nm('tb'), -r, r, 0, L, -r, r, 'Brass')
    pt = math.tan(math.radians(LT['pitch'])); h = hw2 + LTOVH
    ap = (0, E + YE + pt * h, 0)
    c = [(-h, E + YE, h), (h, E + YE, h), (h, E + YE, -h), (-h, E + YE, -h)]
    for k in range(4):
        a_, b_ = c[k], c[(k + 1) % 4]
        mid = Vector(((a_[0] + b_[0]) / 2, 0, (a_[2] + b_[2]) / 2)).normalized()
        mesh(nm('cap'), [a_, b_, ap], [(0, 1, 2)], 'S_shade', normals2=[Vector((mid.x * pt, 1, mid.z * pt)).normalized()])
        quad(nm('sof'), [(a_[0], a_[1] - .25, a_[2]), (b_[0], b_[1] - .25, b_[2]), (b_[0] * hw2 / h, E, b_[2] * hw2 / h), (a_[0] * hw2 / h, E, a_[2] * hw2 / h)], 'S_shade', (0, -1, 0))
    ay = ap[1]
    lathe(nm('ofin'), [(.16, ay - .3, True), (.12, ay + 2.3, True), (0, ay + 2.6, False)], 'Brass', seg=4)
    Mr = T(0, ay + 1.65, 0) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    lathe(nm('oarm'), [(.8, -.05, True), (.92, -.05, True), (.92, .05, True), (.8, .05, True)], 'Brass', seg=8, M=Mr, caps=False)
    # the loggia: its floor, its painted arcade front and sides, its lean-to
    z0, z1, fl = 6.0, 13.0, .6
    quad(nm('lf'), [(-hw, fl, z1), (hw, fl, z1), (hw, fl, z0), (-hw, fl, z0)], 'Pale', (0, 1, 0))
    with G.at(z=z1):
        for xa in (-6, -2, 2):
            card(nm('la'), xa, xa + 4, fl - .6, fl + 5.0, 0, 'X_arcade')
    for s in (-1, 1):
        with G.at(M=T(s * hw, 0, (z0 + z1) / 2) @ RY(s * math.pi / 2)):
            card(nm('ls'), -3.5, 3.5, fl - .6, fl + 5.0, 0, 'X_arcade')
    p = math.tan(math.radians(14)); yt = fl + 5.1
    quad(nm('lr'), [(-hw - .8, yt, z1 + .9), (hw + .8, yt, z1 + .9), (hw + .8, yt + p * (z1 + .9 - z0), z0), (-hw - .8, yt + p * (z1 + .9 - z0), z0)], 'S_shade', (0, 1, p))


def long_tower(part):
    """THE LONG TOWER (MM-1: "the tallest, louvres shut for three hundred years"; D-14: 12 x 12
    with a straight-flight well stair inside its walls, no stair turret). Origin: the
    footprint centre on the knoll (21.6); +z is its front, the Provost's loggia (local z 6..13).
      * a battered basalt base two storeys tall, the door from the loggia, the annex's
        window band on floor 1 ("scratch my window frames");
      * the shaft in the wide hall ruling, quoined, two narrow windows a storey;
      * the SEALED ROOM oversailing 0.6 on a three-course corbel table: louvres shut and
        PAINTED OVER, chalky grey-green (MM-7), under 1.4 m bracketed eaves -- the 3D slats
        and the four brass telescopes are lt_louvres (drawn with this file's LOD0 to 140 m);
      * a steep 32 deg cap, its apex about 57 m (absolute), an armillary finial about 59.
    part: 'shell' (LOD0, built at DET 1 with its quoins, corbels and brackets kept: it is
    always drawn to 140 m), 'l1' (lt_shell_l1: windows painted on, the louvres painted, the
    barrels as prisms)."""
    global FLATWIN
    FLATWIN = part == 'l1'
    try:
        _long_tower(part)
    finally:
        FLATWIN = False


def _long_tower(part):
    hw = LT['hw']; base = LT['base']; R0 = LT['R0']; rb = LT['rb']; E = LT['E']; hw2 = hw + LT['over']
    fr = face_frames(0, 0, hw)
    fr2 = face_frames(0, 0, hw2)
    for k, M in enumerate(fr):
        with G.at(M=M):
            # the battered base: its face leans out 0.45 at the foot
            with G.at(M=Matrix(((1, 0, 0, 0), (0, 1, 0, 0), (0, -.45 / base, 1, .45), (0, 0, 0, 1)))):
                hb1, hb2 = [], []
                if k == 0:
                    Hd = door(0, w=1.6, floor=.6, h=3.0, rise=.5, recess=.9, vous=.42, n=11, leaf=False, open_=True)
                    hb1.append(Hd)
                    for x in (-3.3, -1.65, 1.65, 3.3):
                        hb2.append(window(x, 5.2, .8, 1.6, 'GlassTall', d=.4, lintel='Pale', frame=True))
                else:
                    for x in (-2.4, 2.4):
                        hb1.append(window(x, 2.4, .35, 1.2, 'GlassHigh', d=.4, sill_slab=False, lintel='Pale'))
                    hb2.append(window(0, 5.3, .5, 1.4, 'GlassTallD', d=.4, lintel='Pale'))
                quad(nm('pod'), [(-hw - .45, -POD, .0), (hw + .45, -POD, 0), (hw + .45, 0, 0), (-hw - .45, 0, 0)], 'Basalt', (0, 0, 1))
                wall(-hw - .45, hw + .45, 0, 4.2, 'Basalt', hb1)
                wall(-hw - .45, hw + .45, 4.2, base, 'Basalt', hb2)
                if k == 0 and not far():
                    box(nm('aband'), -4.0, 4.0, 4.98, 5.2, -.05, .14, 'Pale')
            # the shaft: wide hall ruling (0.5 m basalt bands at the storey lines)
            ys = [base + .3] + [f for f in LT['floors'][3:]] + [R0]
            for i_ in range(len(ys) - 1):
                y0, y1 = ys[i_], ys[i_ + 1]
                fl = LT['floors'][2 + i_] if 2 + i_ < len(LT['floors']) else y0
                xs = (-2.4, 2.4) if k != 0 else (-2.4, 2.4)
                hs = [window(x, y0 + 1.0, .7, 1.8, 'GlassTallD' if (i_ + k) % 2 else 'GlassTall', lintel='Basalt') for x in xs] if y1 - y0 > 3 else []
                wall(-hw, hw, y0, y1, 'Tufa', hs)
                if i_ > 0: band(y0 - .25, .5)
            quoins(-hw, base + .3, R0, -1, step=.5, force=True); quoins(hw, base + .3, R0, 1, step=.5, force=True)
            if not far():
                for cx in (-3.6, 0.0, 3.6):
                    for (ya, yb_, out) in ((R0 - 1.4, R0 - .9, .2), (R0 - .9, R0 - .4, .42), (R0 - .4, R0, .6)):
                        pbox(nm('ocr'), cx - .28, cx + .28, ya, yb_, -.05, out, 'Pale')
    for k, M in enumerate(fr2):
        with G.at(M=M):
            hs = [hole(-hw2 + .45, -.3, rb + .35, E - .5, 0, 1), hole(.3, hw2 - .45, rb + .35, E - .5, 0, 1)]
            wall(-hw2, hw2, rb, E - .3, 'Tufa', hs)
            for H in hs:
                reveal(H, 0, .34, 'TimberD'); infill(H, -.34, 'R_louvre_shut')
            pbox(nm('opost'), -.3, .3, rb + .35, E - .5, -.32, .06, 'Basalt', keep=(4,))      # its sides ARE the reveals' jambs
            # one basalt pier a CORNER, laid by the face that turns it (review 2026-10-06: each
            # face laid both its end piers, so two boxes overlapped in every corner), wrapping the
            # corner 0.08 so its side is the next face's pier front
            obox(nm('opier'), -hw2 - .08, -hw2 + .45, rb, E - .3, -.32, .08, 'Basalt', omit=('-y', '+y', '+x'))
            # its inner side only where it stands proud (behind that, the louvres' jamb is the face)
            quad(nm('opis'), [(-hw2 + .45, rb, 0), (-hw2 + .45, rb, .08), (-hw2 + .45, E - .3, .08), (-hw2 + .45, E - .3, 0)], 'Basalt', (1, 0, 0))
            if not far():
                x = -hw2 + .6
                while x < hw2 - .2:
                    bracket(x, E + YE - .24, 0, LTOVH * .97, h=.95)
                    x += 1.5
            # (A-7: the instruments stand on the observing gallery, lt_louvres; lt_far paints them far)
    # the courses round the square as mitred rings (review: four boxes a course overlapped at
    # every corner): the base's coping, the corbel table (pale / basalt / pale, each top only
    # where the next leaves it), the sealed room's sill and its wall plate
    ring_course(hw, hw + .14, base, base + .3, 'Pale')
    cs = ((R0, R0 + .3, .2, 'Pale'), (R0 + .3, R0 + .65, .4, 'Basalt'), (R0 + .65, rb, .62, 'Pale'))
    for i, (ya, yb_, out, sf) in enumerate(cs):
        nxt = cs[i + 1][2] if i + 1 < len(cs) else LT['over'] + .22
        prv = cs[i - 1][2] if i else 0.0
        ring_course(hw, hw + out, ya, yb_, sf, top_in=hw + min(nxt, out), bot_in=hw + prv)
    ring_course(hw2, hw2 + .22, rb, rb + .35, 'Pale', bot_in=hw + .62)
    ring_course(hw2, hw2 + .12, E - .3, E, 'Timber', top=False)
    # the cap: a steep pyramid of dark glaze, bracketed eaves, the armillary finial
    pt = math.tan(math.radians(LT['pitch']))
    h = hw2 + LTOVH
    ap = (0, E + YE + pt * h, 0)
    c = [(-h, E + YE, h), (h, E + YE, h), (h, E + YE, -h), (-h, E + YE, -h)]
    for k in range(4):
        a, b = c[k], c[(k + 1) % 4]
        mid = Vector(((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2)).normalized()
        roof_plane([a, b, ap], (Vector(b) - Vector(a)).normalized(), Vector((mid.x * pt, 1, mid.z * pt)), surf='PantileD')
        tube(a, ap, .16, (0, 1, 0), seg=3, surf='PantileD', close=True)
        eave_edge(a, b, (mid.x, 0, mid.z), E + YE, LTOVH, soffit='R_eave_band', mitre=True, sark=pt)
    ay = ap[1]
    lathe(nm('ofin'), [(.16, ay - .3, True), (.16, ay + .5, True), (.3, ay + .65, True), (.3, ay + .75, True),
                       (.07, ay + .9, True), (.05, ay + 2.3, True), (.14, ay + 2.42, True), (0, ay + 2.6, False)], 'Brass', seg=8 if not far() else 5)
    for ang, tilt in ((0, 0), (math.pi / 2, 0), (0, math.radians(66))):
        Mr = T(0, ay + 1.65, 0) @ RY(ang) @ Matrix.Rotation(tilt, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X')
        lathe(nm('oarm'), [(.82, -.04, True), (.9, -.04, True), (.9, .04, True), (.82, .04, True)], 'Brass', seg=20 if not far() else 10, M=Mr, caps=False)
    provost_loggia()


def provost_loggia():
    """The Provost's loggia at the tower's foot (floor 0 of the tower, MOONMERE.md section 3:
    "return the finished box to my desk"): a flagged floor up three steps from Observatory
    Close, a banded three-arch front and an arch each side, a beamed lean-to roof falling
    from the tower. Local z 6..13."""
    hw = LT['hw']; z0, z1 = 6.0, 13.0; fl = .6; sp = 3.2
    obox(nm('lflr'), -hw, hw, -POD, fl, z0, z1, 'Pale', omit=('-y', '-z'))       # its buried faces go
    for k in range(3):
        # each step its own block (nested boxes shared their end faces: coplanar)
        obox(nm('lstp'), -3.0, 3.0, -POD, fl - .2 * (k + 1), z1 + .4 * k, z1 + .4 * (k + 1), 'Pale', omit=('-y', '-z'))
    wt = .55
    # the front: piers at x -6, -2, 2, 6; three stilted banded arches
    with G.at(z=z1):
        hs = [hole(-5.55, -2.45, fl + sp, fl + sp, 1.0, 10), hole(-1.55, 1.55, fl + sp, fl + sp, 1.0, 10), hole(2.45, 5.55, fl + sp, fl + sp, 1.0, 10)]
        for x in (-6.0, -2.0, 2.0, 6.0):
            xa, xb = max(-hw, x - .45), min(hw, x + .45)
            box(nm('lp'), xa, xb, fl, fl + sp, -wt, 0, 'Tufa')
            if not far():
                box(nm('lpb'), xa - .05, xb + .05, fl, fl + .35, -wt - .05, .06, 'Basalt')
                box(nm('lpc'), xa - .05, xb + .05, fl + sp - .25, fl + sp, -wt - .05, .06, 'Basalt')
        wall(-hw, hw, fl + sp, fl + 5.0, 'Tufa', hs)
        wall(-hw, hw, fl + sp, fl + 5.0, 'TufaS', hs, z=-wt, facing=-1)
        for H in hs:
            reveal(H, 0, wt, 'PaleS', sill=False, jambs=False, head=far())      # the voussoirs carry the soffit
            voussoirs(H, .38, .06, -wt - .02, n=11)
        band(fl + 5.0 - .3, .3, x0=-hw, x1=hw)
    for s in (-1, 1):
        with G.at(M=T(s * hw, 0, (z0 + z1) / 2) @ RY(s * math.pi / 2)):
            He = hole(-2.0, 2.0, fl + sp, fl + sp, 1.0, 10)
            for x in (-3.5, 3.5):
                if x * s < 0: continue          # the front corner's pier is the front row's (two boxes z-fought)
                box(nm('lsp'), x - .5 if x > 0 else x, x if x > 0 else x + .5, fl, fl + sp, -wt, 0, 'Tufa')
            wall(-3.5, 3.5, fl + sp, fl + 5.0, 'Tufa', [He])
            wall(-3.5, 3.5, fl + sp, fl + 5.0, 'TufaS', [He], z=-wt, facing=-1)
            reveal(He, 0, wt, 'PaleS', sill=False, jambs=False, head=far())
            voussoirs(He, .38, .06, -wt - .02, n=11)
            band(fl + 5.0 - .3, .3, x0=-3.5, x1=3.5)
    quad(nm('lce'), [(-hw, fl + 4.6, z0), (hw, fl + 4.6, z0), (hw, fl + 4.6, z1 - wt), (-hw, fl + 4.6, z1 - wt)], 'TimberD', (0, -1, 0))
    if d0():
        for x in (-4, -2, 0, 2, 4):
            box(nm('lbm'), x - .1, x + .1, fl + 4.35, fl + 4.6, z0, z1 - wt, 'Timber')
    yt = fl + 5.0
    p = math.tan(math.radians(14))
    F0, F1 = (-hw - .8, yt + .1, z1 + .9), (hw + .8, yt + .1, z1 + .9)
    W0, W1 = (-hw - .8, yt + .1 + p * (z1 + .9 - z0), z0), (hw + .8, yt + .1 + p * (z1 + .9 - z0), z0)
    roof_plane([F0, F1, W1, W0], (1, 0, 0), Vector((0, 1, p)))
    eave_edge(F0, F1, (0, 0, 1), yt + .1, .9)
    for s, xe in ((-1, -hw - .8), (1, hw + .8)):
        q = [(xe, yt - .12, z1 + .9), (xe, yt + .12, z1 + .9), (xe, W0[1] + .12, z0), (xe, W0[1] - .12, z0)]
        quad(nm('lv'), q if s < 0 else q[::-1], 'Timber', (s, 0, 0))
    mount('lamp', 0, fl + 4.1, z0 + 2.0, hang=True)


# A-7 (the look review: "the louvre storey reads as sage-green clapboard siding; four
# identical brass telescopes at the same angle and spacing poke out of black square holes;
# below the band a dark slot shows the interior"): the louvres are FRAMED -- each half of a
# face split by a timber mullion and a transom into four panels of angled blades over a
# shadowed back, a rail at the foot closing the slot to the sill -- and the instruments
# stand OUTSIDE them, on an open observing gallery on the front face, each its own kind at
# its own angle: the great refractor on its equatorial pier, a transit instrument between
# two stone piers on the meridian, a small telescope on a tripod, a brass quadrant.
# (pivot (x, z) on the gallery, aim (yaw from +z, elevation), tube length, radius)
LT_INSTR = {
    'refractor': ((-3.7, .62), (-.38, 38.0), 3.1, .15),
    'transit':   ((1.05, .55), (0.0, 68.0), 1.35, .1),
    'tripod':    ((4.15, .7), (.62, 17.0), 1.25, .075),
}


def lt_aim(yaw, elev):
    e = math.radians(elev)
    return Vector((math.sin(yaw) * math.cos(e), math.sin(e), math.cos(yaw) * math.cos(e)))


def lt_tube(P, d, L, r, name='tube'):
    """A telescope tube from P along d: the barrel, a ring at the objective, a dew cap and an
    eyepiece end, as one brass lathe."""
    prof = [(r * .55, -.12, False), (r * .6, 0, False), (r, .06, True), (r, L * .58, True), (r * 1.18, L * .6, True),
            (r * 1.08, L * .66, False), (r * 1.08, L, True), (r * .9, L, False)]
    q = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
    lathe(nm(name), prof, 'Brass', seg=7 if not far() else 5, M=T(*P) @ q, caps=False)


def lt_louvres():
    """The sealed room's louvres, shut and painted over (MM-7: chalky grey-green), framed,
    with the observing gallery and its instruments on the front (A-7, above). Drawn with
    lt_shell's LOD0 (to 140 m); never lit (MM-1: the city's one dark top room)."""
    hw2 = LT['hw'] + LT['over']; rb = LT['rb']; E = LT['E']
    y0, y1 = rb + .35, E - .5
    ym = (y0 + y1) / 2
    for k, M in enumerate(face_frames(0, 0, hw2)):
        with G.at(M=M):
            tops, unders, backs = [], [], []
            for xa, xb in ((-hw2 + .45, -.3), (.3, hw2 - .45)):
                xm = (xa + xb) / 2
                # (the blades run the half's width behind its mullion: one blade, not two, a row;
                # the frames are a walnut swatch -- a strip surface cut a 7 m mullion at every
                # metre, MEASURED 416 triangles for eight of them)
                pa, pb = xa, xb
                for (ta, tb) in ((y0 + .15, ym - .07), (ym + .07, y1 - .15)):
                    backs.append([(pa, ta, -.32), (pb, ta, -.32), (pb, tb, -.32), (pa, tb, -.32)])
                    n = max(4, round((tb - ta) / .45))
                    pitch = (tb - ta) / n
                    for b in range(n):
                        yb = ta + b * pitch
                        back_y, nose_y = yb + pitch * .96, yb + pitch * .22
                        tops.append([(pa, nose_y, -.04), (pb, nose_y, -.04), (pb, back_y, -.3), (pa, back_y, -.3)])
                        unders.append([(pb, nose_y - .035, -.04), (pa, nose_y - .035, -.04), (pa, back_y - .035, -.3), (pb, back_y - .035, -.3)])
                # the frame: a mullion, a transom, the foot rail (closing the slot to the sill) and the head rail
                obox(nm('lmul'), xm - .08, xm + .08, y0, y1, -.34, .0, 'S_oak', omit=('-z',))
                obox(nm('ltr'), xa, xb, ym - .07, ym + .07, -.34, .02, 'S_oak', omit=('-z',))
                obox(nm('lft'), xa, xb, rb + .3, y0 + .15, -.34, .04, 'S_oak', omit=('-z',))
                obox(nm('lhd'), xa, xb, y1 - .15, y1 + .02, -.34, .02, 'S_oak', omit=('-z',))
            mesh(nm('lbk'), [p for q in backs for p in q], [tuple(range(4 * i, 4 * i + 4)) for i in range(len(backs))], 'S_dark', facing=(0, 0, 1))
            mesh(nm('lbl'), [p for q in tops for p in q], [tuple(range(4 * i, 4 * i + 4)) for i in range(len(tops))], 'S_shutgreen', facing=(0, 1, 1))
            mesh(nm('lbu'), [p for q in unders for p in q], [tuple(range(4 * i, 4 * i + 4)) for i in range(len(unders))], 'S_shutgreen', facing=(0, -1, -1), tint=.5)
            if k != 0: continue
            # THE OBSERVING GALLERY: a timber deck 1.4 m out on brackets, a railing round it
            gx0, gx1, gy = -hw2 + .5, hw2 - .5, LT_LEDGE
            obox(nm('gdk'), gx0, gx1, gy - .14, gy, -.3, 1.4, 'S_oak', omit=('-z',))
            for xb_ in (gx0 + .3, -2.4, -.0, 2.4, gx1 - .3):
                prism(nm('gbr'), [(-.3, gy - .14), (1.25, gy - .14), (-.3, gy - 1.1)], xb_ - .06, xb_ + .06, 'S_oak', axis='x')
            for xp in [gx0 + .05 + i * (gx1 - gx0 - .1) / 9 for i in range(10)]:
                box(nm('grp'), xp - .04, xp + .04, gy, gy + 1.0, 1.28, 1.36, 'S_oak')
            box(nm('grr'), gx0, gx1, gy + .96, gy + 1.04, 1.26, 1.38, 'S_oak')
            box(nm('grm'), gx0, gx1, gy + .48, gy + .53, 1.3, 1.34, 'S_oak')
            # the great refractor on its equatorial pier: an iron column, the polar head, the
            # tube in its cradle with a counterweight on the far side
            (px, pz), (yaw, el), L, r = LT_INSTR['refractor']
            lathe(nm('rpi'), [(.16, gy, True), (.16, gy + .1, True), (.08, gy + .16, True), (.07, gy + 1.05, True), (.11, gy + 1.12, True), (0, gy + 1.14, False)], 'S_iron', seg=8, cx=px, cz=pz)
            box(nm('rhd'), -.1, .1, gy + 1.1, gy + 1.32, -.12, .12, 'S_iron', M=T(px, 0, pz))
            d = lt_aim(yaw, el)
            P = Vector((px, gy + 1.42, pz)) - d * (L * .42)
            lt_tube(P, d, L, r, 'rtb')
            cw = Vector((px, gy + 1.38, pz)) - d.cross(Vector((0, 1, 0))).normalized() * .45
            box(nm('rcw'), -.07, .07, -.07, .07, -.07, .07, 'S_iron', M=T(*cw))
            # the transit instrument: two pale piers, an axle, a short tube on the meridian
            (px, pz), (yaw, el), L, r = LT_INSTR['transit']
            for sx in (-.42, .42):
                obox(nm('tpr'), px + sx - .13, px + sx + .13, gy, gy + 1.0, pz - .16, pz + .16, 'Pale', omit=('-y',))
            box(nm('tax'), px - .45, px + .45, gy + .92, gy + .98, pz - .03, pz + .03, 'Brass')
            d = lt_aim(yaw, el)
            lt_tube(Vector((px, gy + .95, pz)) - d * (L * .5), d, L, r, 'ttb')
            # the small telescope on its tripod
            (px, pz), (yaw, el), L, r = LT_INSTR['tripod']
            head = Vector((px, gy + 1.25, pz))
            for a in (0.3, 2.4, 4.5):
                foot = Vector((px + math.cos(a) * .45, gy, pz + math.sin(a) * .45))
                tube(foot, head, .025, (0, 1, 0), seg=3, surf='Timber', close=True)
            d = lt_aim(yaw, el)
            lt_tube(head - d * (L * .45), d, L, r, 'stb')
            # a brass quadrant on its post: a quarter ring in the meridian plane, its plumb line
            qx, qz = -1.35, .7
            box(nm('qpo'), qx - .05, qx + .05, gy, gy + 1.1, qz - .05, qz + .05, 'S_oak')
            lathe(nm('qar'), [(.62, -.025, True), (.7, -.025, True), (.7, .025, True), (.62, .025, True)], 'Brass', seg=8,
                  a0=0, a1=math.pi / 2, M=T(qx, gy + 1.1, qz) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(-math.pi / 2, 4, 'X'), caps=False)
            box(nm('qpl'), qx - .008, qx + .008, gy + 1.1 - .6, gy + 1.1, qz - .008, qz + .008, 'S_rope')


# ====================================================================== civic helpers
def hip_rect(hx, hz, y, o=OVH, pitch=20.0, surf='Pantile', brackets=True, ridge_r=.15, cx=0.0, cz=0.0, soffit='R_eave_band'):
    """A hipped roof over the rectangle cx +- hx, cz +- hz whose wall tops are at y: the
    ridge along the longer axis, hip rolls, fascias and painted soffits, and (DET 0/1)
    a bracket every metre along the eaves."""
    p = math.tan(math.radians(pitch))
    ye = y + YE
    X, Z = hx + o, hz + o
    swap = Z > X
    if swap: X, Z = Z, X
    rh = ye + p * Z
    r = X - Z
    def P(a, b, h):
        return (cx + b, h, cz + a) if swap else (cx + a, h, cz + b)
    c = [P(-X, Z, ye), P(X, Z, ye), P(X, -Z, ye), P(-X, -Z, ye)]
    R0, R1 = P(-r, 0, rh), P(r, 0, rh)
    def N(nx, nz):
        return Vector((nz, 1, nx)) if swap else Vector((nx, 1, nz))
    if r > 1e-6:
        roof_plane([c[0], c[1], R1, R0], Vector(c[1]) - Vector(c[0]), N(0, p), surf)
        roof_plane([c[2], c[3], R0, R1], Vector(c[3]) - Vector(c[2]), N(0, -p), surf)
        tube(R0, R1, ridge_r, (0, 1, 0), seg=4, surf=surf)
    else:
        roof_plane([c[0], c[1], R1], Vector(c[1]) - Vector(c[0]), N(0, p), surf)
        roof_plane([c[2], c[3], R0], Vector(c[3]) - Vector(c[2]), N(0, -p), surf)
    roof_plane([c[3], c[0], R0], Vector(c[0]) - Vector(c[3]), N(-p, 0), surf)
    roof_plane([c[1], c[2], R1], Vector(c[2]) - Vector(c[1]), N(p, 0), surf)
    for a, b in ((c[0], R0), (c[3], R0), (c[1], R1), (c[2], R1)):
        tube(a, b, .12, (0, 1, 0), seg=3, surf=surf)
    for i in range(4):
        a, b = c[i], c[(i + 1) % 4]
        m = Vector(((a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz))
        out = Vector((1 if abs(m.x) > abs(m.z) and m.x > 0 else -1 if abs(m.x) > abs(m.z) else 0, 0,
                      0 if abs(m.x) > abs(m.z) else (1 if m.z > 0 else -1)))
        eave_edge(a, b, out, ye, o, soffit=soffit, mitre=True)
    if brackets == 'force' or (brackets and DET == 0):
        st_ = 1.0
        for (x0_, x1_, zz, dz, rot) in ((-hx, hx, hz, 1, 0), (-hx, hx, -hz, -1, 0))[:1 if brackets == 'force' else 2]:   # 'force': the front
            x = x0_ + st_ / 2
            while x < x1_ - .3:
                bracket(cx + x, ye - .24, cz + zz, o * .97, dirn=dz); x += st_
        for sx in (-1, 1) if brackets != 'force' else ():          # 'force' (DET 1): the long faces only
            z = -hz + st_ / 2
            while z < hz - .3:
                with G.at(M=T(cx + sx * hx, 0, cz + z) @ RY(sx * math.pi / 2)):
                    bracket(0, ye - .24, 0, o * .97)
                z += st_
    return rh


def face_win(x0, x1, y0, y1, wins, surf='Tufa', z=0.0):
    """A wall face with windows: wins = [(cx, sill, w, h, glass, kwargs)]."""
    hs = [window(cx, sl, w, h, gl, z=z, **kw) for cx, sl, w, h, gl, kw in wins]
    wall(x0, x1, y0, y1, surf, hs, z=z)
    return hs


def hall_faces(hx, hz, E, pl=.6, front_door=None, bay=4.0, front_skip=(), side_win=True, glass='GlassHall', pilasters=True,
               style=None):
    """The four faces of a hall-ruled civic block (+-hx, +-hz): a battered basalt plinth,
    honey-ochre tufa (the wash), tall windows a bay; the front door (an open doorway: civic
    doors are always enterable) in the middle. Each face is built in its own frame (never
    mirrored); the courses round the block are mitred rings (rect_course).

    style -- review 2026-10-06: "the Returns Archive and the Mending College are near-twins ...
    long blank boxes", so the two halls no longer share an elevation:
      'archive' (the Returns Archive, a store of books that must stay dry): the ground storey
        RULED -- a thin basalt course every 0.9 m, the direction's signature at its densest --
        under the WIDE band; the upper storey nearly blind (MM-1: blank-ish, high-windowed),
        pierced only by paired square LOUVRED VENTS under a bracketed cornice;
      'college' (the Mending College, an infirmary): a LIME-rendered upper storey over the
        tufa (the courts' white brought to the street), its windows in pale surrounds, glazed
        roundels of the academy's ring between the arched ground-storey windows (the
        foundling-hospital roundels), two thin rules for the wide band, banded quoins."""
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            n = max(1, int(round(2 * half / bay)))
            xs = [-half + (i + .5) * 2 * half / n for i in range(n)]
            gaps, h1, h2 = [], [], []
            vents = []
            for x in xs:
                # the windows either side of the door stay off its voussoirs (they crossed them)
                if k == 0 and front_door is not None and abs(x - front_door) < bay * .5 + .01: continue
                if k == 0 and any(abs(x - s) < .1 for s in front_skip): continue
                if k != 0 and not side_win and abs(x) < half - 2: continue
                h1.append(window(x, 1.9, 1.3, 4.0, glass, rise=.45, vous=.4, n=9, d=.42))
                if style == 'archive':
                    for vx in (x - .55, x + .55):
                        Hv = hole(vx - .28, vx + .28, E - 1.5, E - .95, 0, 1)
                        h2.append(Hv); vents.append(Hv)
                elif style == 'college':
                    h2.append(window(x, 8.1, 1.0, 2.0, 'GlassTall', lintel='Pale', frame=True))
                    if not far() and abs(x + half) > 1.5:
                        plaque(x - bay / 2, 5.6, .7)            # a roundel between the arches
                else:
                    # the upper storey's windows square-headed under a basalt lintel: the tall arched
                    # hall windows below carry the banded arches (and the bytes, MOONMERE.md O-7)
                    h2.append(window(x, 8.1, 1.1, 2.1, 'GlassTall', lintel='Basalt'))
            if k == 0 and front_door is not None:
                Hd = door(front_door, w=2.0, floor=pl, h=3.4, rise=.7, recess=1.0, vous=.5, n=13, leaf=False, fan=True, open_=True)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                plaque(front_door, 6.3, .55)
                for s in (-1, 1): mount('lamp', front_door + s * 1.6, 4.3, 0)
            plinth(-half, half, pl, gaps=gaps, mitre=True)
            wall(-half, half, pl, 6.9, 'Tufa', h1)
            if style == 'archive':
                # the ruling: thin basalt courses every 0.9 m, cut round the windows and the door
                for y in (1.5, 2.4, 3.3, 4.2, 5.1, 6.0):
                    xs_ = [-half]
                    for H in sorted(h1, key=lambda h_: h_['a']):
                        if H['c'] - .05 < y + .08 and H['ys'] + H['rise'] + .5 > y:
                            xs_ += [H['a'] - .02, H['b'] + .02]
                    xs_.append(half)
                    for xa, xb in zip(xs_[::2], xs_[1::2]):
                        if xb - xa > .1: pbox(nm('rl'), xa, xb, y, y + .08, -.03, .025, 'Basalt', keep=(4,))
            upper = 'Lime' if style == 'college' else 'Tufa'
            wall(-half, half, 7.4, E - .3, upper, h2)
            for Hv in vents:
                reveal(Hv, 0, .25, 'PaleS'); infill(Hv, -.25, 'R_louvre')
                if not far(): pbox(nm('vs'), Hv['a'] - .08, Hv['b'] + .08, Hv['c'] - .08, Hv['c'], 0, .1, 'Pale', keep=(3, 4))
            if not far() and style == 'college':
                # banded quoins at the corners of the white storey
                quoins(-half, 7.4, E - .3, -1, step=.5, force=True)
            if not far() and pilasters and style != 'college':
                for i in range(n + 1):
                    x = -half + i * 2 * half / n
                    if k == 0 and front_door is not None and abs(x - front_door) < 1.3: continue   # never across the door
                    xa, xb = max(-half, x - .18), min(half, x + .18)
                    pbox(nm('pil'), xa, xb, pl, 6.9, -.02, .1, 'Pale', lean='front')
                    if style != 'archive':
                        pbox(nm('pil'), xa, xb, 7.4, E - .3, -.02, .1, 'Pale', lean='front')
    if style == 'college':
        rect_course(hx, hz, .05, 6.9, 7.02, 'Basalt'); rect_course(hx, hz, .05, 7.28, 7.4, 'Basalt')
        rect_course(hx, hz, .03, 7.02, 7.28, 'Pale', top=False, bottom=False)
    else:
        rect_course(hx, hz, .05, 6.9, 7.4, 'Basalt')
    if style == 'archive':
        # the cornice: a pale course under the plate (the brackets come with the roof)
        rect_course(hx, hz, .18, E - .55, E - .3, 'Pale', top_in=.12)
    rect_course(hx, hz, .12, E - .3, E, 'Timber', top=False)


def lining(x0, x1, z0, z1, y0, y1, gaps=None, surf='Lime', windows=(), skip=()):
    """An interior's walls, facing IN, from y0 to y1 round the rectangle; gaps: {side:
    [(a, b, top)]} where side is 'n' (z1), 's' (z0), 'e' (x1), 'w' (x0) and a..b runs along
    the wall's own +x (looking at it from inside). windows: painted glass panels
    [(side, c, sill, w, h)] (the shell's windows seen from within). Positions along a wall
    are MODULE coordinates (x on n/s, z on e/w); skip: sides left open."""
    gaps = gaps or {}
    cx_, cz_ = (x0 + x1) / 2, (z0 + z1) / 2
    # side: (length, frame, module coordinate -> the wall's own x)
    sides = {'n': (x1 - x0, T(cx_, 0, z1) @ RY(math.pi), lambda a: -(a - cx_)),
             's': (x1 - x0, T(cx_, 0, z0), lambda a: a - cx_),
             'e': (z1 - z0, T(x1, 0, cz_) @ RY(-math.pi / 2), lambda a: a - cz_),
             'w': (z1 - z0, T(x0, 0, cz_) @ RY(math.pi / 2), lambda a: -(a - cz_))}
    for side, (L, M, f) in sides.items():
        if side in skip: continue
        with G.at(M=M):
            hs = []
            for a, b, top in gaps.get(side, []):
                la, lb = sorted((f(a), f(b)))
                hs.append(hole(la, lb, y0, top, 0, 1))
            wall(-L / 2, L / 2, y0, y1, surf, hs)
            for s_, c, sl, w, h in windows:
                if s_ != side: continue
                c = f(c)
                # (A-13: the inside face, GlassIn -- GlassTallD's night twin lit it amber inside dark rooms)
                quad(nm('lw'), [(c - w / 2, sl, .01), (c + w / 2, sl, .01), (c + w / 2, sl + h, .01), (c - w / 2, sl + h, .01)], 'GlassIn', (0, 0, 1))
                pass


def slab(x0, x1, z0, z1, y, t=.25, top='Timber', under='S_oak', holes=(), beams=2.4):
    """A floor slab: its top (boards), its underside (the ceiling below: boarded walnut on
    beams every `beams` m across the short span), cut round holes [(hx0, hz0, hx1, hz1)] (the
    stair wells). Review 2026-10-06: the underside defaulted to the never-lit S_shade, a black
    void over every multi-storey room. The boards and beams are flat oak swatches (a strip
    would slice them every metre: a 10 m beam was 60 triangles)."""
    if under and beams and not far():
        along_x = (x1 - x0) >= (z1 - z0)           # beams span the SHORT way, spaced along the long
        L0, L1 = (x0, x1) if along_x else (z0, z1)
        k = max(1, int((L1 - L0) / beams))
        for i in range(1, k + 1):
            c = L0 + (L1 - L0) * i / (k + 1)
            segs = [(z0, z1) if along_x else (x0, x1)]
            for h in holes:
                lo, hi = (h[0], h[2]) if along_x else (h[1], h[3])
                if lo - .15 < c < hi + .15:
                    a_, b_ = (h[1], h[3]) if along_x else (h[0], h[2])
                    segs = [sg for s0, s1 in segs for sg in ((s0, min(s1, a_)), (max(s0, b_), s1)) if sg[1] - sg[0] > .3]
            for s0, s1 in segs:
                if along_x:
                    obox(nm('bm'), c - .1, c + .1, y - t - .22, y - t, s0, s1, 'S_hull', omit=('+y', '-z', '+z'))
                else:
                    obox(nm('bm'), s0, s1, y - t - .22, y - t, c - .1, c + .1, 'S_hull', omit=('+y', '-x', '+x'))
    xs = sorted({x0, x1} | {h[0] for h in holes} | {h[2] for h in holes})
    zs = sorted({z0, z1} | {h[1] for h in holes} | {h[3] for h in holes})
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            a, b, c, d = xs[i], xs[i + 1], zs[j], zs[j + 1]
            mx, mz = (a + b) / 2, (c + d) / 2
            if not (x0 <= mx <= x1 and z0 <= mz <= z1): continue
            if any(h[0] < mx < h[2] and h[1] < mz < h[3] for h in holes): continue
            quad(nm('fl'), [(a, y, d), (b, y, d), (b, y, c), (a, y, c)], top, (0, 1, 0))
            if under: quad(nm('cl'), [(a, y - t, c), (b, y - t, c), (b, y - t, d), (a, y - t, d)], under, (0, -1, 0))


def int_flight(x0, z0, x1, z1, y0, y1, width=1.2, surf='S_pale_s', rail=True, solid=True):
    """A straight interior flight from (x0, z0, y0) to (x1, z1, y1): n risers of
    (y1 - y0) / n on treads along the line (MOONMERE.md intStair: 12 x 0.30 on 0.33), a
    stringer, a handrail; its underside closed (it is seen from below in a well)."""
    L = math.hypot(x1 - x0, z1 - z0); n = max(2, int(round((y1 - y0) / .3)))
    ang = math.atan2(x1 - x0, z1 - z0)
    with G.at(M=T(x0, y0, z0) @ RY(ang)):
        hw = width / 2; tr = L / n; rs = (y1 - y0) / n
        # the sawtooth (treads and risers), its underside and its two cheeks -- the cheeks laid a
        # step at a time as convex quads (review 2026-10-06: the whole concave cheek as one
        # polygon triangulated with inverted pieces)
        H_ = y1 - y0
        yu = lambda z_: -.3 + z_ * H_ / L
        vs, fs, ns = [], [], []

        def q(pts, nrm):
            k_ = len(vs); vs.extend(pts); fs.append(tuple(range(k_, k_ + len(pts)))); ns.append(Vector(nrm))
        for k in range(n):
            za, zb_ = k * tr, (k + 1) * tr; yt = (k + 1) * rs; yr = k * rs if k else -.3
            q([(-hw, yt, za), (hw, yt, za), (hw, yt, zb_), (-hw, yt, zb_)], (0, 1, 0))            # tread
            q([(-hw, yr, za), (hw, yr, za), (hw, yt, za), (-hw, yt, za)], (0, 0, -1))             # riser
            for sx in (-hw, hw):
                q([(sx, yu(za), za), (sx, yu(zb_), zb_), (sx, yt, zb_), (sx, yt, za)], (1 if sx > 0 else -1, 0, 0))
        q([(-hw, yu(0), 0), (hw, yu(0), 0), (hw, yu(L), L), (-hw, yu(L), L)], (0, -1, -.1))     # underside
        q([(-hw, yu(L), L), (hw, yu(L), L), (hw, H_, L), (-hw, H_, L)], (0, 0, 1))              # the top's back
        mesh(nm('tr'), vs, fs, surf, normals2=ns)
        if not solid:
            # stringers and rail in the flight's (z, y) profile, extruded ACROSS it (axis 'x'):
            # review 2026-10-06 -- built on the default axis they ran sideways out of the flight,
            # a 4 m pole through two buildings' walls
            prism(nm('strg'), [(0, -.25), (L, y1 - y0 - .25), (L, y1 - y0 - .05), (0, .05)], -hw - .06, -hw, 'Timber', axis='x')
            prism(nm('strg'), [(0, -.25), (L, y1 - y0 - .25), (L, y1 - y0 - .05), (0, .05)], hw, hw + .06, 'Timber', axis='x')
            # the underside, closed
            quad(nm('sub'), [(-hw, -.25, 0), (hw, -.25, 0), (hw, y1 - y0 - .25, L), (-hw, y1 - y0 - .25, L)], 'TimberD', (0, -1, .3))
        if rail and not far():
            prism(nm('hr'), [(0, .95), (L, y1 - y0 + .95), (L, y1 - y0 + 1.0), (0, 1.0)], hw - .03, hw + .03, 'S_oak', axis='x')
            for t in (0.0, 1.0):
                z = L * t; box(nm('np'), hw - .04, hw + .04, (y1 - y0) * t, (y1 - y0) * t + 1.0, z - .04, z + .04, 'S_oak')


def bookcase(x0, x1, z, y0, h=2.4, depth=.4, yaw=0.0, burned=False):
    """A bookcase standing against the wall line z (its frame's +z is the room): a timber
    carcass from z to z + depth, the books' face on its front. (Review 2026-10-06: the
    carcass ran -z from z, so every bookcase stood 0.35 m through its wall.)"""
    with G.at(M=T((x0 + x1) / 2, y0, z) @ RY(yaw)):
        w = (x1 - x0) / 2
        obox(nm('bc'), -w, w, 0, h, 0, depth, 'S_oak', omit=('-y', '-z'))
        quad(nm('bk'), [(-w + .06, .1, depth + .01), (w - .06, .1, depth + .01), (w - .06, h - .1, depth + .01), (-w + .06, h - .1, depth + .01)],
             'S_char' if burned else 'R_books', (0, 0, 1))


def stack(x, z, y0, L=3.2, h=2.3, yaw=0.0, burned=False, tilt=0.0):
    """A free-standing double-sided book stack (an archive's or a library's rows): a timber
    carcass with books on both faces and an end board."""
    with G.at(M=T(x, y0, z) @ RY(yaw) @ Matrix.Rotation(tilt, 4, 'Z')):
        obox(nm('st'), -L / 2, L / 2, 0, h, -.3, .3, 'S_oak', omit=('-y',))
        for sg in (1, -1):
            q = [(-L / 2 + .06, .1, .31 * sg), (L / 2 - .06, .1, .31 * sg), (L / 2 - .06, h - .1, .31 * sg), (-L / 2 + .06, h - .1, .31 * sg)]
            quad(nm('sb'), q if sg > 0 else q[::-1], 'S_char' if burned else 'R_books', (0, 0, sg))


def lectern(x, z, y0, yaw=0.0):
    """A reading lectern: a post on a foot, a sloped desk with an open ledger."""
    with G.at(M=T(x, y0, z) @ RY(yaw)):
        box(nm('lf'), -.25, .25, 0, .08, -.25, .25, 'S_oak')
        box(nm('lp'), -.06, .06, .08, 1.0, -.06, .06, 'S_oak')
        quad(nm('ld'), [(-.35, 1.0, .22), (.35, 1.0, .22), (.35, 1.22, -.2), (-.35, 1.22, -.2)], 'S_oak', (0, 1, .5))
        quad(nm('lb'), [(-.3, 1.015, .18), (.3, 1.015, .18), (.3, 1.2, -.16), (-.3, 1.2, -.16)], 'S_cloth', (0, 1, .5))


def cabinet(x, z, y0, w=1.4, h=1.8, yaw=0.0):
    """A cabinet of drawers against a wall line z (+z the room), brass pulls painted."""
    with G.at(M=T(x, y0, z) @ RY(yaw)):
        obox(nm('cab'), -w / 2, w / 2, 0, h, 0, .5, 'S_oak', omit=('-y', '-z'))
        for k in range(4):
            y = .25 + k * (h - .3) / 4
            quad(nm('pull'), [(-.08, y, .505), (.08, y, .505), (.08, y + .04, .505), (-.08, y + .04, .505)], 'S_brass_p', (0, 0, 1))


def globe(x, z, y0, r=.38):
    """A celestial globe on a turned stand, a brass meridian ring."""
    lathe(nm('gst'), [(.22, 0, True), (.22, .06, True), (.06, .12, True), (.05, .7, True), (0, .72, False)], 'S_oak', seg=6, cx=x, cz=z, cy=y0)
    lathe(nm('glb'), [(0, .72, False), (r * .7, .72 + r * .3, False), (r, .72 + r, False), (r * .7, .72 + r * 1.7, False), (0, .72 + 2 * r, False)],
          'S_blue', seg=8, cx=x, cz=z, cy=y0)
    lathe(nm('gmr'), [(r + .04, -.02, True), (r + .08, -.02, True), (r + .08, .02, True), (r + .04, .02, True)], 'S_brass_p', seg=8,
          M=T(x, y0 + .72 + r, z) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)


def rug(x0, x1, z0, z1, y):
    """A woven rug laid on a floor (the cloth swatch, a darker border)."""
    quad(nm('rug'), [(x0, y + .012, z1), (x1, y + .012, z1), (x1, y + .012, z0), (x0, y + .012, z0)], 'S_red', (0, 1, 0))
    quad(nm('rugi'), [(x0 + .2, y + .016, z1 - .2), (x1 - .2, y + .016, z1 - .2), (x1 - .2, y + .016, z0 + .2), (x0 + .2, y + .016, z0 + .2)], 'S_cloth', (0, 1, 0))


def table(x, z, y0, w=1.6, d=.8, h=.78, top='S_oak'):
    """A trestle table: a top on two board trestles (four box legs cost 96 vertices)."""
    box(nm('tt'), x - w / 2, x + w / 2, y0 + h - .06, y0 + h, z - d / 2, z + d / 2, top)
    for sx in (-1, 1):
        obox(nm('tl'), x + sx * (w / 2 - .12) - .04, x + sx * (w / 2 - .12) + .04, y0, y0 + h - .06, z - d / 2 + .1, z + d / 2 - .1, 'S_oak', omit=('-y', '+y'))


# ====================================================================== civic shells (always drawn: DET 1)
def ar_shell():
    """THE RETURNS ARCHIVE (24 x 14, three storeys). Its door is centred on the front, onto
    Academy Court (MOONMERE.md section 2); six bays in the ARCHIVE elevation (hall_faces: a
    ruled ground storey, a nearly blind upper storey with paired louvred vents, a bracketed
    cornice), an entrance porch on two columns, a louvred cupola on the ridge where the clerks
    read the weather. Review 2026-10-06: it and the College were near-twins."""
    hx, hz, E = 12.0, 7.0, 11.4
    hall_faces(hx, hz, E, front_door=0.0, style='archive')
    with G.at(z=hz):
        # THE PORCH: two pale columns carrying a banded entablature and a small hipped roof,
        # 1.4 m out over the doorstep; the brass ring of the academy high over it
        zc = 1.2
        for x in (-1.75, 1.75):
            box(nm('pcb'), x - .3, x + .3, 0, .4, zc - .3, zc + .3, 'Basalt')
            lathe(nm('pcol'), [(.21, .4, True), (.18, .55, True), (.16, 4.55, True), (.25, 4.75, True), (.25, 4.9, True)], 'Pale', seg=8,
                  cx=x, cz=zc, caps=False, smooth=False, phase=math.pi / 8)
            pbox(nm('pres'), x - .22, x + .22, .6, 4.9, -.05, .12, 'Pale', keep=(0, 1, 4))     # its respond on the wall
        obox(nm('pent'), -2.2, 2.2, 4.9, 5.5, 0, 1.55, 'Pale', omit=('-z',))
        pbox(nm('penb'), -2.25, 2.25, 5.18, 5.3, 1.55, 1.6, 'Basalt', keep=(0, 1, 2, 3, 4))
        hip_rect(2.2, .78, 5.5, o=.3, pitch=24, cz=.78, brackets=False)
        lathe(nm('ring'), [(.42, -.04, True), (.55, -.04, True), (.55, .05, True), (.42, .05, True)], 'Brass', seg=16, M=T(0, 9.3, .15) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
    rh = hip_rect(hx, hz, E, pitch=22, brackets='force')
    # the cupola: a louvred timber lantern on the ridge, its own little hipped cap
    yb = rh - .4
    for k, M in enumerate(face_frames(0, 0, 1.2)):
        with G.at(M=M):
            quad(nm('cub'), [(-1.2, yb, 0), (1.2, yb, 0), (1.2, yb + 1.9, 0), (-1.2, yb + 1.9, 0)], 'R_louvre', (0, 0, 1))
            box(nm('cup'), 1.05, 1.25, yb, yb + 2.0, -.2, .05, 'Timber')      # one post a corner (two overlapped)
    hip_rect(1.2, 1.2, yb + 2.0, o=.4, pitch=30, brackets=False)
    for x in (-7.0, 7.0):
        with G.at(M=T(x, rh - 1.6, -2.0)):
            chimney()


def lodge_shell():
    """A lodge (the Registry and the Bursar: one file placed twice), 12 x 11, two storeys
    on a 0.6 plinth, a pavilion roof. Its door is centred on the front (onto the Court)."""
    hx, hz, E, pl = 6.0, 5.5, 7.8, .6
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            gaps, h1, h2 = [], [], []
            xs = (-3.6, -1.6, 1.6, 3.6) if k % 2 == 0 else (-3.0, 0.0, 3.0)
            for x in xs:
                if k == 0 and abs(x) < 2: continue
                h1.append(window(x, 1.8, 1.0, 2.0, 'GlassTall', rise=.3, vous=.3, n=9, d=.35))
                h2.append(window(x, 5.0, .9, 1.7, 'GlassTallD' if x < 0 else 'GlassTall', lintel='Basalt', shutters=False))
            if k == 0:
                Hd = door(0, w=1.6, floor=pl, h=2.9, rise=.5, recess=.9, vous=.42, n=11, leaf=False, open_=True)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                for s in (-1, 1): mount('lamp', s * 1.25, 3.9, 0)
                h2.append(window(0, 5.0, .9, 1.7, 'GlassTall', lintel='Basalt'))
                stone_balcony(0, 4.85) if DET < 2 else None
                # S1 review ("the lodges differ mainly at the roofline"): the Registry's front
                # keeps benches in its plinth either side of the door, where the Bursar has a
                # pedimented doorcase
                bench(-3.05, -1.25); bench(1.25, 3.05)
            plinth(-half, half, pl, gaps=gaps, mitre=True)
            wall(-half, half, pl, 4.2, 'Tufa', h1)
            if not far():
                # ...and its ground storey is BANDED, broad basalt courses on the tufa every 0.9 m
                # (the Bursar's is ruled with thin basalt lines; LOOKED: pale courses on the gold
                # tufa did not read at the court's distance), cut round the openings
                for y in (1.35, 2.25, 3.15):
                    xs_ = [-half]
                    for H in sorted(h1, key=lambda h_: h_['a']):
                        if H['c'] - .05 < y + .22 and H['ys'] + H['rise'] + .5 > y:
                            xs_ += [H['a'] - .02, H['b'] + .02]
                    xs_.append(half)
                    for xa, xb in zip(xs_[::2], xs_[1::2]):
                        if xb - xa > .1: pbox(nm('bnd'), xa, xb, y, y + .22, -.02, .03, 'Basalt', keep=(3, 4))
            rule(4.2, x0=-half, x1=half, holes=h2)
            wall(-half, half, 4.2, E - .3, 'Tufa', h2)
            pbox(nm('plate'), -half - .05, half + .05, E - .3, E, -.12, .12, 'Timber')
            quoins(-half, pl, E - .3, -1); quoins(half, pl, E - .3, 1)
    rh = hip_rect(hx, hz, E, pitch=26)
    lathe(nm('fin'), [(.1, rh - .1, True), (.1, rh + .45, True), (.2, rh + .6, True), (0, rh + .95, False)], 'Brass', seg=6)
    with G.at(M=T(3.5, E + 1.0, -2.5)):
        chimney()
    # S1 (MM-14, Philip 2026-10-07: "the two lodges must differ"): THE REGISTRY'S STUDY TOWER.
    # A-7 gave the Bursar its own elevation (ruled stone, lime, a clock gable, a bell-cote) on
    # the same cube under the same hip, and from the court the pair still read as twins. The
    # Registry -- where the academy's names are kept -- now rises in a square study tower at
    # its back west corner, the town's own vocabulary (MM-1: square study towers with louvred
    # top rooms; these louvres stand open), so the two read apart by SILHOUETTE: a tower and
    # a pavilion roof on the west, a clock gable and a bell-cote on the east.
    # (S1 review: at the back west corner it stood in front of tower_N2's dark belvedere from the
    # court and the two read as one jumbled roof mass; at the FRONT EAST corner, by the Mere
    # Stair's head, its cap stands over N2's from anywhere on the court -- 39 degrees up from
    # the court's middle against N2's 28 -- and marks the head of the stair)
    tx, tz, th = 3.1, 2.3, 1.6
    y0, yl0, yl1, yt = E - .6, E + 3.1, E + 4.75, E + 5.05
    for k, M in enumerate(face_frames(tx, tz, th)):
        with G.at(M=M):
            hw_ = [window(0, E + 1.4, .55, 1.1, 'GlassTallD' if k % 2 else 'GlassTall', lintel='Basalt', shutters=False)]
            wall(-th, th, y0, yl0 - .3, 'Tufa', hw_)
            Hl = hole(-1.15, 1.15, yl0, yl1, 0, 1)
            wall(-th, th, yl0 - .3, yt, 'Tufa', [Hl])
            louvre_opening(-1.15, 1.15, yl0, yl1, 'R_louvre')
            band(yl0 - .42, .24, x0=-th, x1=th)
            quoins(-th, y0, yt, -1, wrap=False); quoins(th, y0, yt, 1, wrap=False)
    with G.at(M=T(tx, 0, tz)):
        ring_course(th, th + .22, yt, yt + .26, 'Pale', top_in=th)
        r0 = (th + .5) * math.sqrt(2)
        lathe(nm('tcap'), [(r0, yt + .26, True), (0, yt + 2.1, False)], 'Pantile', seg=4, phase=math.pi / 4, caps=False, smooth=False)
        quad(nm('tsof'), [(-th - .5, yt + .25, th + .5), (th + .5, yt + .25, th + .5), (th + .5, yt + .25, -th - .5), (-th - .5, yt + .25, -th - .5)],
             'TimberD', (0, -1, 0))
        lathe(nm('tfin'), [(.08, yt + 2.0, True), (.08, yt + 2.4, True), (.16, yt + 2.55, True), (0, yt + 2.85, False)], 'Brass', seg=6)


def lodge_shell_b():
    """A-7: THE BURSAR'S LODGE, the Registry's pair across the Mere Stair's head given its
    own identity (the look review: "the twin lodges have the same roof, balcony, chimney and
    windows"). Same footprint (12 x 11 on a 0.6 plinth), same door (centred on the front,
    lodge_in's), so the interior, the site and the colliders are the Registry's -- the
    differences are all elevation: a RULED ground storey (thin basalt courses every 0.9 m,
    the counting house's stone), its windows in arched PAIRS; a LIME-rendered upper storey
    with a Serlian three-light window over a pedimented doorcase (no balcony); the white storey's corners left plain (the lime reads the corner); and on the roof a CLOCK GABLE to the court -- the Bursar keeps the
    academy's hours -- with a bell-cote on the ridge, where the Registry has a plain pavilion
    and a chimney."""
    hx, hz, E, pl = 6.0, 5.5, 7.8, .6
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            gaps, h1, h2 = [], [], []
            pairs = ((-3.85, -2.75), (2.75, 3.85)) if k % 2 == 0 else ((-2.4, -1.3), (1.3, 2.4))
            for pa in pairs:
                for x in pa:
                    h1.append(window(x, 1.7, .85, 2.1, 'GlassTall', rise=.28, vous=.24, n=7, d=.35))
                h2.append(window(sum(pa) / 2, 5.0, .95, 1.6, 'GlassTall' if pa[0] > 0 else 'GlassTallD', lintel='Pale', frame=True))
            if k == 0:
                Hd = door(0, w=1.6, floor=pl, h=2.9, rise=.5, recess=.9, vous=.42, n=11, leaf=False, open_=True)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                for s_ in (-1, 1): mount('lamp', s_ * 1.6, 3.6, .3)
                # the Serlian window: an arched centre light between two narrow square ones
                h2.append(window(0, 4.9, .95, 1.95, 'GlassTall', rise=.35, vous=.26, n=7, d=.35))
                for x in (-1.05, 1.05):
                    h2.append(window(x, 4.9, .45, 1.45, 'GlassTallD', lintel='Pale', sill_slab=False))
                if not far():
                    # the doorcase: two pale pilasters and a pediment, proud of the ruled wall
                    for x in (-1.25, 1.25):
                        pbox(nm('dcp'), x - .16, x + .16, pl, pl + 3.3, -.02, .3, 'Pale')
                    pbox(nm('dce'), -1.5, 1.5, pl + 3.3, pl + 3.55, -.02, .36, 'Pale')
                    prism(nm('dcpe'), [(-1.55, pl + 3.55), (1.55, pl + 3.55), (0, pl + 4.15)], -.02, .34, 'Pale')
            plinth(-half, half, pl, gaps=gaps, mitre=True)
            wall(-half, half, pl, 4.2, 'Tufa', h1)
            if not far():
                # the ruling: thin basalt courses every 0.9 m, cut round the openings
                for y in (1.5, 2.4, 3.3):
                    xs_ = [-half]
                    for H in sorted(h1, key=lambda h_: h_['a']):
                        if H['c'] - .05 < y + .08 and H['ys'] + H['rise'] + .5 > y:
                            xs_ += [H['a'] - .02, H['b'] + .02]
                    xs_.append(half)
                    for xa, xb in zip(xs_[::2], xs_[1::2]):
                        if xb - xa > .1: pbox(nm('rl'), xa, xb, y, y + .08, -.03, .025, 'Basalt', keep=(4,))
            band(4.2, .3, x0=-half, x1=half)
            wall(-half, half, 4.35, E - .3, 'Lime', h2)
            pbox(nm('plate'), -half - .05, half + .05, E - .3, E, -.12, .12, 'Timber')
    rh = hip_rect(hx, hz, E, pitch=24)
    # the clock gable to the court: a pedimented tufa gable on the front slope, its pale
    # coping, the clock face (a glazed dial, black hands at ten to two) and a pantile hood
    gy, gw, gh, gz = E + .2, 2.6, 2.4, hz - .1
    prism(nm('cgw'), [(-gw, gy), (gw, gy), (gw, gy + .6), (0, gy + gh), (-gw, gy + .6)], gz - 1.6, gz, 'Tufa')
    pts_c = [(-gw - .12, gy + .55), (0, gy + gh + .14), (gw + .12, gy + .55)]
    for (a_, b_) in ((pts_c[0], pts_c[1]), (pts_c[1], pts_c[2])):
        dx, dy = b_[0] - a_[0], b_[1] - a_[1]; L_ = math.hypot(dx, dy); nx_, ny_ = -dy / L_ * .16, dx / L_ * .16
        prism(nm('cgc'), [a_, b_, (b_[0] + nx_, b_[1] + ny_), (a_[0] + nx_, a_[1] + ny_)], gz - 1.7, gz + .1, 'Pale')
    cy_ = gy + 1.15
    lathe(nm('cdl'), [(0, -.01, False), (.5, -.01, True), (.5, .04, True), (0, .04, False)], 'S_lime_s', seg=12,
          M=T(0, cy_, gz + .04) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    lathe(nm('cdr'), [(.5, -.03, True), (.62, -.03, True), (.62, .07, True), (.5, .07, True)], 'Pale', seg=12,
          M=T(0, cy_, gz + .04) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
    box(nm('chh'), -.02, .02, cy_, cy_ + .3, gz + .1, gz + .13, 'S_iron')
    with G.at(M=T(0, cy_, 0) @ Matrix.Rotation(math.radians(-60), 4, 'Z')):
        box(nm('chm'), -.015, .015, 0, .42, gz + .12, gz + .15, 'S_iron')
    for k_ in range(4):
        a_ = k_ * math.pi / 2
        box(nm('ctk'), -.02, .02, -.02, .02, gz + .09, gz + .11, 'S_iron', M=T(math.sin(a_) * .43, cy_ + math.cos(a_) * .43, 0))
    # the gable's own little roof back into the hip
    p_ = math.tan(math.radians(30))
    for sx in (-1, 1):
        roof_plane([(0, gy + gh + .14, gz + .3), (sx * (gw + .3), gy + .5, gz + .3), (sx * (gw + .3), gy + .5, gz - 3.2), (0, gy + gh + .14, gz - 3.2)],
                   Vector((0, 0, -1)), Vector((sx * p_, 1, 0)))
    tube((0, gy + gh + .14, gz + .3), (0, gy + gh + .14, gz - 3.2), .12, (0, 1, 0), seg=3, surf='Ridge')
    # the bell-cote on the ridge: two pale piers, an arched head, the bell
    by = rh - .2
    for x in (-.45, .45):
        obox(nm('bcp'), x - .14, x + .14, by, by + 1.4, -.2, .2, 'Pale', omit=('-y',))
    box(nm('bch'), -.62, .62, by + 1.4, by + 1.62, -.25, .25, 'Pale')
    prism(nm('bcr'), [(-.7, by + 1.62), (.7, by + 1.62), (0, by + 2.05)], -.3, .3, 'Pantile')
    lathe(nm('bell'), [(0, by + .62, False), (.24, by + .64, True), (.2, by + .78, True), (.14, by + 1.12, True), (.05, by + 1.2, True), (0, by + 1.22, False)], 'Brass', seg=8)


def pg_shell():
    """THE PRECINCT GATE (8 x 6, roofed at 12 m; no louvre room, so the Long Tower's sealed
    room shows over it from the Landing). A deep banded arch, a level passage at the Court's
    14.4, the brass ring emblem and a window storey. Its flanks are PW and PE."""
    th, dep = 4.0, 3.0
    Ha = hole(-2.0, 2.0, 0, 3.9, 1.3, 14)
    for fc in (1, -1):
        with G.at(M=T(0, 0, dep * fc) @ (RY(0) if fc > 0 else RY(math.pi))):
            wall(-th, th, -POD, 8.4, 'Tufa', [Ha])
            voussoirs(Ha, .7, .12, -.8, n=15)
            if not far():
                y = 0.0; i = 0
                while y < 3.9 - 1e-6:
                    hgt = min(.5, 3.9 - y)
                    for s in (-1, 1):
                        w = .6 if i % 2 == 0 else .38
                        xa, xb = (-2.0 - w, -2.0) if s < 0 else (2.0, 2.0 + w)
                        box(nm('gj'), xa, xb, y, y + hgt, -.8, .12, 'Pale' if i % 2 == 0 else 'Basalt')
                    y += hgt; i += 1
            band(6.0, .3, x0=-th, x1=th)
            lathe(nm('grg'), [(.55, -.04, True), (.7, -.04, True), (.7, .05, True), (.55, .05, True)], 'Brass', seg=16,
                  M=T(0, 7.2, .2) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
            Hw = window(0, 9.0, 1.1, 1.9, 'GlassTall', rise=.25, vous=.3)
            band(8.4, .3, x0=-th, x1=th)
            wall(-th, th, 8.7, 11.7, 'Tufa', [Hw])
            box(nm('gpl'), -th - .05, th + .05, 11.7, 12.0, -.12, .1, 'Timber')
            quoins(-th, 0, 11.7, -1, wrap=False); quoins(th, 0, 11.7, 1, wrap=False)
            mount('lamp', -2.9, 4.2, 0); mount('lamp', 2.9, 4.2, 0)
    for s in (-1, 1):
        with G.at(M=T(s * th, 0, 0) @ RY(s * math.pi / 2)):
            wall(-dep, dep, -POD, 12.0, 'Tufa')
            band(6.0, .3, x0=-dep, x1=dep); band(8.4, .3, x0=-dep, x1=dep)
    with G.at(z=dep):
        # the passage runs face to face (it was built at z 0..-6, off the gate's own frame);
        # the banded jamb blocks line its first and last 0.8
        passage(-2.0, 2.0, 3.9, depth=2 * dep, surf='TufaS', inset=0.0 if far() else .8, inset_far=0.0 if far() else .8)
        reveal(dict(Ha, c=3.9), -.8, 2 * dep - 1.6, 'TufaS', jambs=False, sill=False)
    mount('lamp', 0, 4.9, 0, hang=True)
    hip_rect(th, dep, 12.0, o=1.2, pitch=22)


def cg_shell():
    """THE CAUSEWAY GATE (14 x 6) at the Landing: a banded arch over the causeway road
    between two square towerlets with louvred tops, where the landing landmark stands in
    the passage (MOONMERE.md section 3). No crenellation (MM-1); lamps, no point lights."""
    dep = 3.0; aw = 2.5; tw0, tw1 = 3.4, 7.0
    Ha = hole(-aw, aw, 0, 4.0, 1.5, 14)
    for fc in (1, -1):
        with G.at(M=T(0, 0, dep * fc) @ (RY(0) if fc > 0 else RY(math.pi))):
            wall(-tw0, tw0, -POD, 9.0, 'Tufa', [Ha])
            voussoirs(Ha, .7, .12, -.8, n=15)
            plaque(0, 6.6, .7)
            band(5.9, .3, x0=-tw0, x1=tw0)
            box(nm('cpl'), -tw0, tw0, 8.7, 9.0, -.12, .1, 'Timber')
            mount('lamp', -aw - .5, 3.9, 0); mount('lamp', aw + .5, 3.9, 0)
            for s in (-1, 1):
                xa, xb = (-tw1, -tw0) if s < 0 else (tw0, tw1)
                cxw = (xa + xb) / 2
                hs1 = [window(cxw, 2.4, .5, 1.1, 'GlassHigh', d=.3, lintel='Basalt', sill_slab=False, grille=True)]
                hs2 = [window(cxw, 5.4, .8, 1.6, 'GlassTallD', lintel='Basalt')]
                plinth(xa, xb)
                wall(xa, xb, 1.2, 4.8, 'Tufa', hs1)
                rule(4.8, x0=xa, x1=xb, holes=hs2)
                wall(xa, xb, 4.8, 8.4, 'Tufa', hs2)
                band(8.4, .24, x0=xa, x1=xb)
                hs3 = [hole(cxw - 1.2, cxw + 1.2, 8.9, 11.0, 0, 1)]
                wall(xa, xb, 8.64, 11.6, 'Tufa', hs3)
                louvre_opening(cxw - 1.2, cxw + 1.2, 8.9, 11.0, 'R_louvre', slats=False)
                box(nm('tpl'), xa - .05, xb + .05, 11.3, 11.6, -.12, .1, 'Timber')
                quoins(xa if s < 0 else xb, 1.2, 11.3, -1 if s < 0 else 1, wrap=False)
    for s in (-1, 1):
        with G.at(M=T(s * tw1, 0, 0) @ RY(s * math.pi / 2)):
            plinth(-dep, dep)
            wall(-dep, dep, 1.2, 11.6, 'Tufa', [window(0, 5.4, .8, 1.6, 'GlassTallD', lintel='Basalt')])
            band(8.4, .24, x0=-dep, x1=dep)
        with G.at(M=T(s * tw0, 9.0, 0) @ RY(-s * math.pi / 2)):
            wall(-dep, dep, 0, 2.6, 'Tufa')
    with G.at(z=dep):
        passage(-aw, aw, 4.0, depth=2 * dep, surf='TufaS')
        reveal(dict(Ha, c=4.0), -.8, 2 * dep - 1.6, 'TufaS', jambs=False, sill=False)
    hip_rect(tw0, dep, 9.0, o=.9, pitch=22)
    for s in (-1, 1):
        hip_rect((tw1 - tw0) / 2, dep, 11.6, o=1.0, pitch=26, cx=s * (tw0 + tw1) / 2, brackets=DET == 0)


def ch_shell():
    """THE CUSTOMS HOUSE (20 x 12; MOONMERE.md section 2): a warehouse-ruled hall 8.5 deep
    in the quay rows' band with R1 inside its back, and a FIVE-ARCH LOGGIA built forward
    onto the apron under its own lean-to, where Sennet keeps the auction (and the
    academy's tax board hangs). Its roof is a parapeted terrace at 7.2 (= 6.2 here), the
    Mere Walk behind it. Origin: the footprint centre; +z the mere."""
    hx = 10.0; zf = 2.5; zl = 6.0; E = EAVE['wr']
    with G.at(z=zf):
        gaps, h1, h2 = [], [], []
        for i, x in enumerate((-8, -4, 0, 4, 8)):
            if x == 0:
                Hd = hole(-1.2, 1.2, 0, 2.6, .6, 10); h1.append(Hd); gaps.append((-1.22, 1.22))
                reveal(Hd, 0, .8, 'PaleS', sill=False, head_from=None if far() else -.22)
                voussoirs(Hd, .36, .06, -.22, n=11, surfs=('Pale', 'Tufa'))
            else:
                Hs = hole(x - 1.1, x + 1.1, .9, 2.5, .5, 10); h1.append(Hs)
                reveal(Hs, 0, .45, 'PaleS', head_from=None if far() else -.2)
                infill(Hs, -.45, 'GlassShop' if abs(x) == 4 else 'GlassTallD')
                voussoirs(Hs, .32, .06, -.2, n=9, surfs=('Pale', 'Tufa'))
                if abs(x) == 8 and not far():
                    quad(nm('board'), [(x - .9, 3.0, .04), (x + .9, 3.0, .04), (x + .9, 3.45, .04), (x - .9, 3.45, .04)], 'R_board', (0, 0, 1))
            Hl = hole(x - .5, x + .5, 4.1, 5.5, 0, 1); h2.append(Hl)
            reveal(Hl, 0, .25, 'PaleS'); infill(Hl, -.25, 'GlassSq' if i % 2 else 'R_loft')
        plinth(-hx, hx, .5, gaps=gaps, z0=.16, z1=.07)
        wall(-hx, hx, .5, 3.6, 'Basalt', h1)
        box(nm('band'), -hx, hx, 3.6, 3.84, -.08, .07, 'Pale')
        wall(-hx, hx, 3.84, E - .3, 'Tufa', h2)
        box(nm('plate'), -hx - .05, hx + .05, E - .3, E, -.1, .12, 'Timber')
        plaque(0, 4.75, .6)
    for s in (-1, 1):
        with G.at(M=T(s * hx, 0, -1.75) @ RY(s * math.pi / 2)):
            hs = [window(-1.5, 4.2, .8, 1.3, 'GlassSq', lintel='Pale')]
            wall(-4.25, 4.25, -POD, 3.6, 'Basalt')
            wall(-4.25, 4.25, 3.84, E - .3, 'Tufa', hs)
            box(nm('band'), -4.25, 4.25, 3.6, 3.84, -.08, .07, 'Pale')
    # the forward loggia: five arches on piers along z = 6, an arch at each end
    with G.at(z=zl):
        hs = [hole(x - 1.55, x + 1.55, 2.6, 2.6, .85, 10) for x in (-8, -4, 0, 4, 8)]
        for x in (-10, -6, -2, 2, 6, 10):
            xa, xb = max(-hx, x - .45), min(hx, x + .45)
            obox(nm('cp'), xa, xb, 0, 2.6, -.5, 0, 'Pale', omit=('-y', '+y'))
            if not far():
                box(nm('cpb'), xa - .05, xb + .05, 0, .35, -.55, .06, 'Basalt')
                box(nm('cpc'), xa - .05, xb + .05, 2.4, 2.6, -.55, .06, 'Basalt')
        wall(-hx, hx, 2.6, 4.2, 'Tufa', hs)
        wall(-hx, hx, 2.6, 4.2, 'TufaS', hs, z=-.5, facing=-1)
        for H in hs:
            reveal(H, 0, .5, 'PaleS', sill=False, jambs=False, head=far())
            voussoirs(H, .34, .06, -.52, n=11)
        band(3.95, .25, x0=-hx, x1=hx)
    for s in (-1, 1):
        with G.at(M=T(s * hx, 0, (zf + zl) / 2) @ RY(s * math.pi / 2)):
            He = hole(-1.2, 1.2, 2.6, 2.6, .8, 8)
            wall(-1.75, 1.75, 2.6, 4.2, 'Tufa', [He])
            for x in (-1.75, 1.75):
                if x * s < 0: continue          # that end is the front row's corner pier (a duplicate box z-fought it)
                box(nm('ep'), x - .5 if x > 0 else x, x if x > 0 else x + .5, 0, 2.6, -.5, 0, 'Pale')
            reveal(He, 0, .5, 'PaleS', sill=False, jambs=False)
    quad(nm('lce'), [(-hx, 3.9, zf), (hx, 3.9, zf), (hx, 3.9, zl - .5), (-hx, 3.9, zl - .5)], 'TimberD', (0, -1, 0))
    # A-7 (the look review: "the arcade soffit is a flat dark plank plane"): the loggia's
    # ceiling on BEAMS -- a cross beam over every pier, joists between, a wall plate each side
    if not far():
        for x in (-10, -6, -2, 2, 6, 10):
            xa, xb = max(-hx, x - .12), min(hx, x + .12)
            obox(nm('lcb'), xa, xb, 3.62, 3.9, zf, zl - .5, 'S_oak', omit=('+y',))
        for x in [(-10 + (k + .5) * 1.0) for k in range(20)]:
            if any(abs(x - p_) < .5 for p_ in (-10, -6, -2, 2, 6, 10)): continue
            obox(nm('lcj'), x - .05, x + .05, 3.78, 3.9, zf, zl - .5, 'S_oak', omit=('+y', '-z', '+z'))
        for zz in (zf + .1, zl - .6):
            obox(nm('lcw'), -hx, hx, 3.7, 3.9, zz - .1, zz + .1, 'S_oak', omit=('+y', '-x', '+x'))
    quad(nm('lfl'), [(-hx, .02, zf), (hx, .02, zf), (hx, .02, zl), (-hx, .02, zl)], 'Pale', (0, 1, 0))
    p = math.tan(math.radians(14)); yt = 4.2
    F0, F1 = (-hx - .6, yt + .1, zl + .8), (hx + .6, yt + .1, zl + .8)
    W0, W1 = (-hx - .6, yt + .1 + p * (zl + .8 - zf), zf), (hx + .6, yt + .1 + p * (zl + .8 - zf), zf)
    roof_plane([F0, F1, W1, W0], (1, 0, 0), Vector((0, 1, p)))
    eave_edge(F0, F1, (0, 0, 1), yt + .1, .8)
    for s, xe in ((-1, -hx - .6), (1, hx + .6)):
        q = [(xe, yt - .12, zl + .8), (xe, yt + .12, zl + .8), (xe, W0[1] + .12, zf), (xe, W0[1] - .12, zf)]
        quad(nm('lv'), q if s < 0 else q[::-1], 'Timber', (s, 0, 0))
    mount('lamp', -4, 3.6, (zf + zl) / 2, hang=True); mount('lamp', 4, 3.6, (zf + zl) / 2, hang=True)
    # the roof terrace at 6.2 (the warehouses' roof_flat, built in), the Walk's balustrade behind
    for x in (-8, -4, 0, 4, 8):
        with G.at(M=T(x, E, zf) @ SC(1, 1, 8.5 / 9.0)):
            roof_flat()


# ====================================================================== THE EXCHANGE (2026-10-11)
# Philip's ruling for every main city's auction house: a PROMINENT building on the city's square
# where players crowd, several broker counters opening one shared house, open floor for a crowd, a
# board, and the one auction emblem that reads from a distance (the same symbol in every city, in
# each city's materials). Moonmere's stands on Academy Court's north side between the Precinct Gate
# and the court's north-east corner, where PE stood (MOONMERE.md "The auction house"): every
# arrival comes through the gate beside it, the crystal is 39 m off across the court.
#
# THE FORM, in the Banded Cloisters' own language (MM-1): a two-storey hall 34 x 11 whose court
# face is one ARCADE of seven banded arches open at the court's level (ruling 6's exception: a
# loggia opens at street level), a ruled tufa clerestory over it under a deep bracketed eave and a
# smoke-violet hip; in its middle a projecting PAVILION 7.6 m wide that rises through the roof to a
# PEDIMENT, the auction roundel in it on both faces -- over the court, and over the Landing Row's
# roofs toward the Landing and the causeway (14.4 + 13.8 m: above the Row's ridges from the spawn).
# THE EMBLEM is tools/assets/auction_emblem.py's roundel in Moonmere's materials: a field of the
# blue glaze (S_blue, the city's glazed-tile plaques), a pale stone ring, the balance in the LIT
# swatch -- pale gold by day, lit by the facade's night sheet after dark, so the sign burns at night
# with no light added (ruling 16). No new texture: every surface is on the sheet already.
# Frame: the footprint centre on the court's 14.4, +z the court (the front); placed at yaw pi.
EX_HX, EX_HZ = 17.0, 5.5          # the hall's half extents
EX_WT = .8                        # its walls' depth (the reveals); the planner's colliders are 0.6
EX_E = 12.0                       # the main eave datum (wall top)
EX_PH, EX_PZ = 3.8, 6.7           # the pavilion's half width, and its faces (it projects 1.2)
EX_E2 = 16.0                      # the pavilion's wall top (the pediment's base)
EX_CEIL = 10.8                    # the hall's ceiling
EX_SIDE = (5.8, 9.8, 13.8)        # the side arches' centres (each side), 3.0 wide on 1.0 piers
EX_ARCH = (1.5, 4.2, 1.5)         # half width, springing, rise (round heads)
EX_MID = (1.8, 4.4, 1.8)          # the pavilion's arch
EX_ROUNDEL = (13.8, 1.6)          # the roundel's centre height and radius
EX_PITCH2 = math.tan(math.radians(24))   # the pavilion's gable roof
EX_IN_Z = (-EX_HZ + .6, EX_HZ - EX_WT)   # the hall's floor between the back wall's lining and the arcade's inner face


def ex_arches():
    """The court face's eight openings (seven arches; the middle one the pavilion's) as holes."""
    hs = []
    for s in (-1, 1):
        for c in EX_SIDE:
            hw, sp, ri = EX_ARCH
            hs.append(hole(s * c - hw, s * c + hw, 0, sp, ri, 12))
    return sorted(hs, key=lambda h: h['a'])


def VS(v=.32):
    """An upper window's banded head, or none on the far form (the painted panes carry it)."""
    return 0.0 if far() else v


def PLATE():
    """The wall plate's surface: timber, or on the far form a flat swatch (a strip slices it every metre)."""
    return 'S_hull' if far() else 'Timber'


def emblem_roundel(cy, r, z, flat=False, cx=0.0, segs=None):
    """THE AUCTION EMBLEM (tools/assets/auction_emblem.py, the map's balance in a ring) in
    Moonmere's materials on a wall face at z (facing +z), centred at (cx, cy): field S_blue, ring
    Pale, the device S_lit. flat: the far form (device and ring laid flat, a coarser circle)."""
    import auction_emblem as AE
    # (the far form's roundel a 12-gon: past 140 m its 3.2 m are a few pixels, the device still reads)
    n_ = (12 if far() else 16) if flat else (segs or 28)
    faces = AE.emblem_faces(r, depth=.12 if not flat else .06, relief=.09, segs=n_, back=False, sides=not flat)
    surf = {'field': 'S_blue', 'ring': 'Pale', 'device': 'S_lit'}
    for part in ('field', 'ring', 'device'):
        vs, fs, ns = [], [], []
        for p_, poly, n_ in faces:
            if p_ != part: continue
            k = len(vs)
            vs.extend((cx + x, cy + y, z + zz) for x, y, zz in poly)
            fs.append(tuple(range(k, k + len(poly))))
            ns.append(Vector(n_))
        if fs: mesh(nm('emb'), vs, fs, surf[part], normals2=ns)


def ex_pilasters(half, top, w=.42):
    """Pale pilasters up a face's two edges, the hall ruling's (hall_faces): the pavilion's frame and
    the ends' corners. (Quoins at MID detail draw every other course only, and the pale squares read as
    loose blocks on the ruled tufa -- LOOKED, the first build.)"""
    if far(): return
    for s in (-1, 1):
        xa, xb = (-half, -half + w) if s < 0 else (half - w, half)
        pbox(nm('pil'), xa, xb, 0, top, -.02, .1, 'Pale', lean='front')


def _ex_rules(x0, x1, holes, ys):
    """Thin basalt courses across a face from x0 to x1 at heights ys, cut round its openings
    (the Archive's ruling, the counting house's stone)."""
    if far(): return
    for y in ys:
        xs_ = [x0]
        for H in sorted(holes, key=lambda h_: h_['a']):
            if H['c'] - .05 < y + .08 and H['ys'] + H['rise'] + .5 > y:
                xs_ += [H['a'] - .02, H['b'] + .02]
        xs_.append(x1)
        for xa, xb in zip(xs_[::2], xs_[1::2]):
            if xb - xa > .1: pbox(nm('rl'), xa, xb, y, y + .08, -.03, .025, 'Basalt', keep=(4,))


def ex_hip_half(s, x_in, y, hz, o=OVH, pitch=22.0, surf='PantileViolet'):
    """Half the hall's hip roof: from x_in (buried in the pavilion) out to the hip at the end
    s * EX_HX. hip_rect would hip BOTH ends, and its inner hip fell away toward the pavilion
    outside its walls; this one carries its ridge on into the pavilion, where it dies unseen."""
    p = math.tan(math.radians(pitch)); ye = y + YE
    Z = hz + o; rh = ye + p * Z
    xe = s * (EX_HX + o); xr = xe - s * Z
    F = [(x_in, ye, Z), (xe, ye, Z), (xr, rh, 0), (x_in, rh, 0)]
    B = [(x_in, ye, -Z), (xe, ye, -Z), (xr, rh, 0), (x_in, rh, 0)]
    roof_plane(F, (s, 0, 0), Vector((0, 1, p)), surf)
    roof_plane(B, (s, 0, 0), Vector((0, 1, -p)), surf)
    roof_plane([(xe, ye, -Z), (xe, ye, Z), (xr, rh, 0)], (0, 0, 1), Vector((s * p, 1, 0)), surf)
    tube((x_in, rh, 0), (xr, rh, 0), .15, (0, 1, 0), seg=2 if far() else 4, surf='Ridge')
    for zz in (-Z, Z):
        tube((xe, ye, zz), (xr, rh, 0), .12, (0, 1, 0), seg=2 if far() else 3, surf='Ridge')
    # the eaves: the long ones mitred at the hip only, the end one at both corners
    eave_edge((x_in, ye, Z), (xe, ye, Z), (0, 0, 1), ye, o, mitre=(0, 1))
    eave_edge((xe, ye, -Z), (x_in, ye, -Z), (0, 0, -1), ye, o, mitre=(1, 0))
    eave_edge((xe, ye, Z), (xe, ye, -Z), (s, 0, 0), ye, o, mitre=True)
    if not far():
        # the brackets a metre apart (the city's deep bracketed eave, MM-1), front and back
        # where the eave shows -- outside the pavilion's projection -- and along the end
        # (the back's only at full detail: the painted soffit carries their silhouettes from the
        # Landing, 60 m and more below them)
        x = s * (EX_PH + .5)
        while abs(x) < EX_HX - .3:
            bracket(x, ye - .24, hz, o * .97, dirn=1)
            if d0(): bracket(x, ye - .24, -hz, o * .97, dirn=-1)
            x += s * 1.0
        with G.at(M=T(s * EX_HX, 0, 0) @ RY(s * math.pi / 2)):
            for k in range(10):
                bracket(-4.5 + k, ye - .24, 0, o * .97)
    return rh


def ex_shell():
    """THE EXCHANGE, Moonmere's auction house (34 x 11; see the block comment above). Always
    drawn at MID detail like the other civic shells, with a far form (ex_shell_l1) past 140 m.
    It carries the hall's own linings, ceiling, floor and the board with its big roundel -- so
    the seven open arches never show the sky through a culled interior from across the court --
    and leaves the counters and the brokers' plaques to ex_in (near only)."""
    hx, hz, E, WT = EX_HX, EX_HZ, EX_E, EX_WT
    ph, pz, E2 = EX_PH, EX_PZ, EX_E2
    ry, rr = EX_ROUNDEL
    zi0, zi1 = EX_IN_Z
    hs = ex_arches()
    # ---- the court face, either side of the pavilion: the arcade and the clerestory over it
    with G.at(z=hz):
        for s in (-1, 1):
            x0, x1 = (ph, hx) if s > 0 else (-hx, -ph)
            mine = [h for h in hs if x0 < (h['a'] + h['b']) / 2 < x1]
            wall(x0, x1, -POD, 7.0, 'Tufa', mine)
            for H in mine:
                # (the far form keeps the jambs and drops the arch's soffit: past 140 m it is a shadow)
                reveal(H, 0, WT, 'PaleS', sill=False, head_from=None if far() else -.24, head=not far())
                voussoirs(H, .42, .06, -.24, n=9 if far() else 13)    # (far: three stones a ring)
                if not far():
                    # the piers' basalt bases and pale imposts at the springing
                    for xe_ in (H['a'], H['b']):
                        sg = -1 if xe_ == H['a'] else 1
                        pbox(nm('pb'), min(xe_, xe_ + sg * .5), max(xe_, xe_ + sg * .5), 0, .45, -.02, .06, 'Basalt', keep=(3, 4))
                        pbox(nm('imp'), min(xe_, xe_ + sg * .45), max(xe_, xe_ + sg * .45), H['ys'] - .18, H['ys'], -.02, .07, 'Pale', keep=(2, 3, 4))
            _ex_rules(x0, x1, mine, (1.0, 1.9, 2.8, 3.7))
            band(7.0 - .09, .2, x0=x0, x1=x1)
            ups = [window(s * c, 8.0, 1.2, 2.6, 'GlassHall', rise=.4, vous=VS(), n=9, d=.35) for c in EX_SIDE]
            wall(x0, x1, 7.0, E - .3, 'Tufa', [u for u in ups if u])
            pbox(nm('plate'), x0, x1, E - .3, E, -.12, .12, PLATE())
            for c in EX_SIDE:
                mount('lamp', s * (c + 2.0), 3.6, 0)
        # the court face's upper storey runs on behind the pavilion's flanks (z 0..1.2 there)
    # ---- the back, toward the riser and the Landing: ruled and high-windowed (MM-1)
    with G.at(M=RY(math.pi) @ T(0, 0, hz)):
        lows = [window(x, 3.2, .8, 1.2, 'GlassHigh', d=.3, lintel='Basalt', sill_slab=False, grille=True) for x in (-13.8, -9.8, -5.8, 5.8, 9.8, 13.8)]
        wall(-hx, hx, -POD, 7.0, 'Tufa', [h for h in lows if h])
        _ex_rules(-hx, hx, [h for h in lows if h], (1.0, 1.9, 2.8, 4.6, 5.5))
        band(7.0 - .09, .2, x0=-hx, x1=hx)
        ups = [window(x, 8.0, 1.2, 2.6, 'GlassHall', rise=.4, vous=VS(), n=9, d=.35) for x in (-13.8, -9.8, -5.8, 5.8, 9.8, 13.8)]
        wall(-hx, hx, 7.0, E - .3, 'Tufa', [u for u in ups if u])
        pbox(nm('plate'), -hx, hx, E - .3, E, -.12, .12, PLATE())
    # ---- the two ends: an arched window a storey, banded quoins at the corners
    for s in (-1, 1):
        with G.at(M=RY(s * math.pi / 2) @ T(0, 0, hx)):
            lo = window(0, 1.6, 1.3, 2.8, 'GlassTall', rise=.5, vous=VS(.38), n=9, d=.4)
            wall(-hz, hz, -POD, 7.0, 'Tufa', [lo] if lo else [])
            _ex_rules(-hz, hz, [lo] if lo else [], (1.0, 1.9, 2.8, 3.7, 4.6, 5.5))
            band(7.0 - .09, .2, x0=-hz, x1=hz)
            up = window(0, 8.0, 1.2, 2.6, 'GlassHall', rise=.4, vous=VS(), n=9, d=.35)
            wall(-hz, hz, 7.0, E - .3, 'Tufa', [up] if up else [])
            pbox(nm('plate'), -hz, hz, E - .3, E, -.12, .12, PLATE())
            ex_pilasters(hz, E - .3)
            mount('lamp', 1.6 * s, 3.4, 0)
    # ---- THE PAVILION: its two faces, its flanks, the pediments with the roundels
    for fc in (1, -1):
        with G.at(M=(RY(0) if fc > 0 else RY(math.pi)) @ T(0, 0, pz)):
            if fc > 0:
                hw, sp, ri = EX_MID
                Hm = hole(-hw, hw, 0, sp, ri, 14)
                wall(-ph, ph, -POD, 7.0, 'Tufa', [Hm])
                reveal(Hm, 0, pz - zi1, 'PaleS', sill=False, head_from=None if far() else -.3, head=not far())
                voussoirs(Hm, .55, .08, -.3, n=9 if far() else 15)
                if not far():
                    for xe_, sg in ((-hw, -1), (hw, 1)):
                        pbox(nm('pb'), min(xe_, xe_ + sg * .7), max(xe_, xe_ + sg * .7), 0, .5, -.02, .07, 'Basalt', keep=(3, 4))
                        pbox(nm('imp'), min(xe_, xe_ + sg * .6), max(xe_, xe_ + sg * .6), sp - .2, sp, -.02, .08, 'Pale', keep=(2, 3, 4))
                _ex_rules(-ph, ph, [Hm], (1.0, 1.9, 2.8, 3.7))
                for s in (-1, 1): mount('lamp', s * 2.7, 3.9, 0)
            else:
                # the back: a blind arch (the riser is behind it), a basalt panel in its head
                Hb = hole(-1.8, 1.8, .6, 4.4, 1.8, 14)
                wall(-ph, ph, -POD, 7.0, 'Tufa', [Hb])
                reveal(Hb, 0, .3, 'TufaS', sill=True, head_from=None if far() else -.3)
                infill(Hb, -.3, 'Lime')
                voussoirs(Hb, .5, .08, -.3, n=9 if far() else 15)
                _ex_rules(-ph, ph, [Hb], (1.9, 2.8, 3.7))
            band(7.0 - .09, .2, x0=-ph, x1=ph)
            Hw = window(0, 7.7, 1.6, 3.1, 'GlassHall', rise=.8, vous=VS(.4), n=11, d=.4)
            wall(-ph, ph, 7.0, E2 - .3, 'Tufa', [Hw] if Hw else [])
            if fc > 0 and not far():
                stone_balcony(0, 7.55)
            # the string course at the main eave's height, carried across the pavilion
            band(11.7, .3, x0=-ph, x1=ph)
            emblem_roundel(ry, rr, 0.0, flat=far(), segs=24)
            pbox(nm('plate'), -ph - .05, ph + .05, E2 - .3, E2, -.12, .14, PLATE())
            ex_pilasters(ph, E2 - .3)
            # the pediment: its tufa field up to the roof's underside (so no slot of sky shows over
            # it), its pale raking cornices under the tiles' edge and its base cornice
            yb = lambda x_: EX_E2 + YE + EX_PITCH2 * (ph + .6 - abs(x_)) - .06
            if far():
                quad(nm('ped'), [(-ph, E2, 0), (ph, E2, 0), (ph, yb(ph), 0), (0, yb(0), 0), (-ph, yb(ph), 0)], 'Tufa', (0, 0, 1))
            else:
                prism(nm('ped'), [(-ph, E2), (ph, E2), (ph, yb(ph)), (0, yb(0)), (-ph, yb(ph))], -1.0, 0.0, 'Tufa')
            pbox(nm('pedb'), -ph - .15, ph + .15, E2, E2 + .22, -.05, .3, 'Pale', keep=(2, 3, 4))
            for sg in (-1, 1) if not far() else ():
                a_, b_ = (sg * (ph + .3), yb(ph + .3)), (0, yb(0))
                prism(nm('pedc'), [a_, b_, (b_[0], b_[1] - .24), (a_[0], a_[1] - .24)], -.6, .34, 'Pale')
            # (no finial: with one the pediment stood level with the study towers' caps, 34 m, and the
            # skyline's order is houses < study towers; MC_Metal would also have been a draw of its own)
    for s in (-1, 1):
        # the pavilion's flanks: where it stands proud of the faces (z 5.5..6.7 and -6.7..-5.5) to
        # its own wall top, and above the hall's roof along its whole depth
        with G.at(M=T(s * ph, 0, 0) @ RY(s * math.pi / 2)):
            for z0_, z1_ in ((hz, pz), (-pz, -hz)):
                quad(nm('pfl'), [(-z1_, -POD, 0), (-z0_, -POD, 0), (-z0_, E2, 0), (-z1_, E2, 0)], 'Tufa', (0, 0, 1))
            quad(nm('pfu'), [(-hz, E, 0), (hz, E, 0), (hz, E2, 0), (-hz, E2, 0)], 'Tufa', (0, 0, 1))
            if not far():
                for z0_, z1_ in ((hz, pz), (-pz, -hz)):
                    pbox(nm('pfb'), -z1_, -z0_, 7.0 - .09, 7.11, -.08, .05, 'Basalt', keep=(2, 3, 4))
    # the pavilion's gable roof, its ridge front to back, the verges 0.5 past the pediments
    p = EX_PITCH2; ye2 = E2 + YE; o2 = .6
    X2, Zv = ph + o2, pz + .5
    rh2 = ye2 + p * X2
    for sg in (-1, 1):
        roof_plane([(sg * X2, ye2, -Zv), (sg * X2, ye2, Zv), (0, rh2, Zv), (0, rh2, -Zv)], (0, 0, 1), Vector((sg * p, 1, 0)), 'PantileViolet')
        eave_edge((sg * X2, ye2, Zv if sg > 0 else -Zv), (sg * X2, ye2, -Zv if sg > 0 else Zv), (sg, 0, 0), ye2, o2, mitre=False, sark=None if far() else p)
        for zz in (-Zv, Zv):
            fz = 1 if zz > 0 else -1
            # the verge's barge board under the tiles' edge, and its boarded underside back to the
            # pediment (a look up past the verge met the tiles' culled back)
            q = [(sg * X2, ye2 - .2, zz), (0, rh2 - .2, zz), (0, rh2 + .05, zz), (sg * X2, ye2 + .05, zz)]
            quad(nm('vg'), q, 'Timber', (0, 0, fz))
            quad(nm('vgs'), [(sg * X2, ye2 - .2, fz * pz), (0, rh2 - .2, fz * pz), (0, rh2 - .2, zz), (sg * X2, ye2 - .2, zz)], 'TimberD', (-sg * p, -1, 0))
    tube((0, rh2, -Zv), (0, rh2, Zv), .16, (0, 1, 0), seg=2 if far() else 4, surf='Ridge')
    # ---- the hall's roof: two hipped halves dying into the pavilion
    for s in (-1, 1):
        ex_hip_half(s, s * (ph - 1.2), E, hz)
    # ---- inside (drawn with the shell: see the docstring)
    ix = hx - .6
    if far():
        # the far form's inside: a dark back and ceiling seen through the arches
        quad(nm('inb'), [(-ix, 0, zi0), (ix, 0, zi0), (ix, EX_CEIL, zi0), (-ix, EX_CEIL, zi0)], 'S_shade', (0, 0, 1))
        quad(nm('inc'), [(-ix, EX_CEIL, zi0), (ix, EX_CEIL, zi0), (ix, EX_CEIL, zi1), (-ix, EX_CEIL, zi1)], 'S_shade', (0, -1, 0))
        quad(nm('inf'), [(-ix, .02, zi1), (ix, .02, zi1), (ix, .02, zi0), (-ix, .02, zi0)], 'S_pale_s', (0, 1, 0))
        return
    slab(-ix, ix, zi0, zi1, .02, under=None, top='Pale')
    # under the arches, out to the faces: the court's own floor carried in
    for H in hs:
        quad(nm('thr'), [(H['a'], .02, hz), (H['b'], .02, hz), (H['b'], .02, zi1), (H['a'], .02, zi1)], 'Pale', (0, 1, 0))
    quad(nm('thr'), [(-EX_MID[0], .02, pz), (EX_MID[0], .02, pz), (EX_MID[0], .02, zi1), (-EX_MID[0], .02, zi1)], 'Pale', (0, 1, 0))
    quad(nm('ceil'), [(-ix, EX_CEIL, zi0), (ix, EX_CEIL, zi0), (ix, EX_CEIL, zi1), (-ix, EX_CEIL, zi1)], 'TimberD', (0, -1, 0))
    for k in range(-8, 9, 2):
        obox(nm('bm'), k * 2.0 - .14, k * 2.0 + .14, EX_CEIL - .32, EX_CEIL, zi0, zi1, 'S_hull', omit=('+y', '-z', '+z'))
    # the linings: the back (its windows' inner panes), the ends, and the arcade's inner face
    wins = [('s', x, 8.0, 1.2, 2.6) for x in (-13.8, -9.8, -5.8, 5.8, 9.8, 13.8)] + [('s', 0, 7.7, 1.6, 3.1)] + \
           [('s', x, 3.2, .8, 1.2) for x in (-13.8, -9.8, -5.8, 5.8, 9.8, 13.8)] + \
           [(sd, 0, 1.6, 1.3, 2.8) for sd in ('e', 'w')] + [(sd, 0, 8.0, 1.2, 2.6) for sd in ('e', 'w')]
    lining(-ix, ix, zi0, zi1, 0, EX_CEIL, windows=wins, skip=('n',))
    # the hall's own courses round its three solid walls: a pale stone dado to 0.9 under a basalt
    # rule, a basalt band over the low windows, a timber cornice under the ceiling (the bare lime
    # read as a white box -- LOOKED, the first build)
    for (M_, L_) in ((T(0, 0, zi0), ix), (T(ix, 0, (zi0 + zi1) / 2) @ RY(-math.pi / 2), (zi1 - zi0) / 2), (T(-ix, 0, (zi0 + zi1) / 2) @ RY(math.pi / 2), (zi1 - zi0) / 2)):
        with G.at(M=M_):
            pbox(nm('dado'), -L_, L_, 0, .9, 0, .05, 'PaleS', keep=(3, 4))
            pbox(nm('irl'), -L_, L_, .9, 1.0, 0, .07, 'Basalt', keep=(2, 3, 4))
            pbox(nm('ibd'), -L_, L_, 4.6, 4.78, 0, .06, 'Basalt', keep=(2, 3, 4))
            pbox(nm('icor'), -L_, L_, EX_CEIL - .32, EX_CEIL, 0, .16, 'Timber', keep=(2, 4))
    with G.at(M=T(0, 0, zi1) @ RY(math.pi)):
        inner = [hole(-(h['b']), -(h['a']), 0, h['ys'], h['rise'], 12) for h in hs] + [hole(-EX_MID[0], EX_MID[0], 0, EX_MID[1], EX_MID[2], 14)]
        wall(-ix, ix, 0, EX_CEIL, 'LimeS', inner)
    # the clerestory windows of the court face, seen from inside
    for x in [s * c for s in (-1, 1) for c in EX_SIDE] + [0]:
        w_, sl, h_ = (1.6, 7.7, 3.1) if x == 0 else (1.2, 8.0, 2.6)
        quad(nm('lw'), [(x + w_ / 2, sl, zi1 - .01), (x - w_ / 2, sl, zi1 - .01), (x - w_ / 2, sl + h_, zi1 - .01), (x + w_ / 2, sl + h_, zi1 - .01)], 'GlassIn', (0, 0, -1))
    # THE BOARD on the back wall between the middle counters, under the house's big roundel: the
    # day's lots pinned up in a pale frame (the Customs House's ledger sheet, R_board)
    zb = zi0 + .02
    pbox(nm('bdf'), -1.75, 1.75, 1.05, 3.15, zb, zb + .08, 'Pale', keep=(0, 1, 2, 3, 4))
    quad(nm('bd'), [(-1.6, 1.2, zb + .085), (1.6, 1.2, zb + .085), (1.6, 3.0, zb + .085), (-1.6, 3.0, zb + .085)], 'R_board', (0, 0, 1))
    emblem_roundel(5.0, 1.0, zb, flat=True)
    # the hall's own lamps: sconces on the back wall either side of the board, and on the piers
    for x in (-6.0, 6.0, -11.0, 11.0):
        mount('lamp', x, 3.4, zb)


def ex_shell_l1():
    """The Exchange's far form (DET 2): its outline -- the arches stay openings, the windows are
    painted, the pavilion and the flat roundel keep the sign -- for past 140 m."""
    ex_shell()


def ex_in():
    """THE EXCHANGE'S FLOOR: four broker counters along the back wall, either side of the board
    (the shell's), each with its ledger, a small balance and the house's roundel over the
    broker's head; benches along the two ends; the rest of the floor open for the crowd. The
    counters' colliders are the record's `walls` (moonmere_civic.ts lays them on floor 0)."""
    zi0, zi1 = EX_IN_Z
    f0 = .02
    walls = []
    for u in EX_COUNTERS:
        # the counter: an oak body, a pale stone top, a ledger and a brass balance on it
        z0c, z1c = EX_COUNTER_Z
        box(nm('ctr'), u - 1.3, u + 1.3, f0, 1.0, z0c, z1c, 'S_oak')
        box(nm('ctt'), u - 1.38, u + 1.38, 1.0, 1.07, z0c - .06, z1c + .06, 'Pale')
        # the customer's face: a basalt kick and a pale band, the counting house's stone on the oak
        pbox(nm('ctk'), u - 1.3, u + 1.3, f0, f0 + .16, z1c, z1c + .03, 'Basalt', keep=(3, 4))
        pbox(nm('ctb'), u - 1.3, u + 1.3, .62, .7, z1c, z1c + .025, 'Pale', keep=(2, 3, 4))
        if d0():
            box(nm('ldg'), u - .55, u + .05, 1.07, 1.12, z0c + .15, z1c - .12, 'S_cloth')
            box(nm('bal'), u + .62, u + .66, 1.07, 1.52, (z0c + z1c) / 2 - .02, (z0c + z1c) / 2 + .02, 'S_brass_p')
            box(nm('bal'), u + .4, u + .88, 1.48, 1.51, (z0c + z1c) / 2 - .015, (z0c + z1c) / 2 + .015, 'S_brass_p')
            for dx in (-.22, .22):
                box(nm('pan'), u + .64 + dx - .09, u + .64 + dx + .09, 1.3, 1.33, (z0c + z1c) / 2 - .09, (z0c + z1c) / 2 + .09, 'S_brass_p')
        # the broker's stool, behind and beside them
        chair(u + .95, zi0 + .55, f0, 0.0)
        # the house's roundel over the broker's head, on the back wall
        emblem_roundel(3.2, .42, zi0 + .02, flat=True, cx=u)    # (a 16-gon: it is seen from the counter)
        walls.append([u - 1.38, z0c - .06, u + 1.38, z1c + .06])
    # benches for the waiting, along both ends of the hall, clear of the end windows' line
    for s in (-1, 1):
        x = s * (EX_HX - .6)
        with G.at(M=T(x, 0, 0) @ RY(-s * math.pi / 2)):
            for zz in (-3.0, 3.0):
                box(nm('wbench'), zz - 1.1, zz + 1.1, f0, f0 + .45, 0, .45, 'S_oak')
        walls += [[x - .45 if s > 0 else x, -4.1, x if s > 0 else x + .45, -1.9], [x - .45 if s > 0 else x, 1.9, x if s > 0 else x + .45, 4.1]]
    record('ex_in', w=2 * EX_HX, d=2 * EX_HZ, floors=[f0], stairs=[], holes=[],
           rooms=[[-(EX_HX - .6), zi0, EX_HX - .6, zi1, f0, EX_CEIL]], walls=walls,
           frame='civic: origin the footprint centre on the court, +z the court; the hall from the back lining to the arcade\'s inner face')


# the counters' centres along the back wall (local x; world x = 17 - u at yaw pi), and their body's
# depth band: the brokers stand 1.0 m off the back lining, 1.3 behind the counter's front
EX_COUNTERS = (-8.4, -3.6, 3.6, 8.4)
# the generator's budgets (the ceilings live in client/test/moonmere_modules.test.mjs)
EX_BUDGET = {'ex_shell': 10000, 'ex_shell_l1': 2000, 'ex_in': 6000}
EX_COUNTER_Z = (EX_IN_Z[0] + 1.6, EX_IN_Z[0] + 2.3)


def mc_shell():
    """THE MENDING COLLEGE (32 x 28): four ranges round a cloister court, the front range
    the infirmary hall (the trainer and the guild masters on its floor 0), a portal on the
    East Terrace. Outer faces in the hall ruling, court faces lime over an arcaded walk,
    one ring roof: outer and inner slopes meeting on a ridge ring (its study tower is
    tower_b, placed by the planner, rising out of the back range)."""
    hx, hz, E = 16.0, 14.0, 11.4
    hall_faces(hx, hz, E, front_door=0.0, pilasters=False, style='college')
    # THE PORTAL'S FRONTISPIECE (review 2026-10-06: the College read as the Archive's twin): the
    # front's middle rises in a banded gable over the eave, the academy's ring in an oculus, a
    # bell-cote on its apex -- the infirmary's bell, the one gable on the Court's skyline
    with G.at(z=hz):
        gw, y0, ys, yt = 4.4, E - .3, E + .7, E + 3.6
        pent = [(-gw, y0), (gw, y0), (gw, ys), (0, yt), (-gw, ys)]
        mesh(nm('gab'), [(x, y, .2) for x, y in pent], [tuple(range(5))], 'Tufa', facing=(0, 0, 1))
        mesh(nm('gabb'), [(x, y, -.7) for x, y in pent], [tuple(range(5))[::-1]], 'TufaS', facing=(0, 0, -1))
        for sg in (-1, 1):
            q = [(sg * gw, y0, .2), (sg * gw, y0, -.7), (sg * gw, ys, -.7), (sg * gw, ys, .2)]
            quad(nm('gabs'), q, 'Tufa', (sg, 0, 0))
            # the raking coping, pale, 0.15 over the gable both sides
            P0 = (sg * (gw + .15), ys - .05); P1 = (0, yt + .1)
            quad(nm('gcop'), [(P0[0], P0[1], .35), (P1[0], P1[1], .35), (P1[0], P1[1], -.85), (P0[0], P0[1], -.85)], 'Pale', (sg * .55, 1, 0))
            quad(nm('gcf'), [(P0[0], P0[1] - .22, .35), (P1[0], P1[1] - .22, .35), (P1[0], P1[1], .35), (P0[0], P0[1], .35)][::(1 if sg < 0 else -1)], 'Pale', (0, 0, 1))
        pbox(nm('gbd'), -gw, gw, ys - .3, ys - .1, .2, .3, 'Basalt', keep=(0, 1, 2, 3, 4))
        quad(nm('gocu'), [(-.6, E + 1.2, .22), (.6, E + 1.2, .22), (.6, E + 2.4, .22), (-.6, E + 2.4, .22)], 'GlassRound', (0, 0, 1))
        lathe(nm('gring'), [(.6, -.04, True), (.74, -.04, True), (.74, .06, True), (.6, .06, True)], 'Brass', seg=16,
              M=T(0, E + 1.8, .25) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
        # the bell-cote: two pale piers, a banded arch, a tiled cap, the bell
        for x in (-.75, .75):
            box(nm('bcp'), x - .2, x + .2, yt - .3, yt + 1.5, -.45, .05, 'Pale')
        Hb = hole(-.55, .55, yt + .4, yt + 1.25, .5, 8)
        wall(-.95, .95, yt + 1.25, yt + 2.0, 'Pale', [Hb], z=.05)
        wall(-.95, .95, yt + 1.25, yt + 2.0, 'Pale', [Hb], z=-.45, facing=-1)
        voussoirs(Hb, .22, .08, -.45, n=7)
        quad(nm('bcc'), [(-1.1, yt + 2.0, .25), (1.1, yt + 2.0, .25), (1.1, yt + 2.45, -.2), (-1.1, yt + 2.45, -.2)], 'Pantile', (0, 1, 1))
        quad(nm('bcc'), [(1.1, yt + 2.0, -.65), (-1.1, yt + 2.0, -.65), (-1.1, yt + 2.45, -.2), (1.1, yt + 2.45, -.2)], 'Pantile', (0, 1, -1))
        for sg in (-1, 1):
            q = [(sg * 1.1, yt + 2.0, .25), (sg * 1.1, yt + 2.0, -.65), (sg * 1.1, yt + 2.45, -.2)]
            mesh(nm('bce'), q, [(0, 1, 2)], 'Pale', facing=(sg, 0, 0))
        lathe(nm('bell'), [(0, yt + .55, False), (.3, yt + .6, True), (.24, yt + .8, True), (.17, yt + 1.15, True), (0, yt + 1.25, False)], 'Brass', seg=10, cz=-.2)
    cx_, cz_ = 8.0, 6.0
    AMB = 2.4            # the ambulatory's back wall, behind the arcade's face (moonmere_civic.ts's colliders)
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = cx_ if k % 2 == 0 else cz_
        dist = cz_ if k % 2 == 0 else cx_
        # the court faces look IN: frame turned pi
        with G.at(M=M @ T(0, 0, dist) @ RY(math.pi)):
            if k == 0:
                # S2 review (LOOKED from the garth and from inside the hall: each arch of the hall's
                # face was filled with a black S_shade slab 1.9 m behind it -- INSIDE the infirmary,
                # where it stood as a monolith across the ward -- and the pier between the middle
                # two arches stood in the court door). The hall's own wall is 0.8 m behind this face
                # (mc_in z 6.8): the court door is the one open arch, 2 m wide over the door's gap
                # (x -1..1, its head 2.6 over floor 0's 0.6), its reveal carried back to the hall's
                # wall; either side a blind arch, lime-plastered 0.45 deep, a stone bench and a tile
                # plaque in it
                Hd = hole(-1.0, 1.0, 0, 2.5, .55, 6)
                hb = [hole(x - 1.5, x + 1.5, 0, 2.5, .75, 6) for x in (-5.0, 5.0)]
                wall(-half, half, -POD, 4.4, 'Lime', [Hd] + hb)
                reveal(Hd, 0, .8, 'PaleS', sill=False)
                for H, x in zip(hb, (-5.0, 5.0)):
                    reveal(H, 0, .45, 'PaleS', sill=False)
                    infill(H, -.45, 'Lime')
                    plaque(x, 1.75, .62, z=-.45)
                    if not far():
                        box(nm('bab'), x - 1.3, x + 1.3, 0, .46, -.45, -.03, 'Pale')     # the bench in the blind arch
                xs = [-6.0, -2.0, 2.0, 6.0]
            else:
                n = int(round(2 * half / 4))
                xs = [-half + (i + .5) * 2 * half / n for i in range(n)]
                ha = [hole(x - 1.5, x + 1.5, 0, 2.5, .75, 6) for x in xs]
                wall(-half, half, -POD, 4.4, 'Lime', ha)
                for H in ha:
                    reveal(H, 0, .55, 'PaleS', sill=False)
                if far():
                    for H in ha: infill(H, -AMB, 'S_shade')
                else:
                    # THE AMBULATORY (S2 review: the garth is walked now -- a physic garden, the court
                    # door and a step down into it -- and through every arch stood the same black slab,
                    # the sky round its edges, and from inside the walk a black monolith): a real walk
                    # 1.85 m wide behind the arcade -- the range's lit back wall on a basalt dado under
                    # a rule, a plaque facing the middle arch, a boarded and joisted soffit under floor 1's
                    # band, flags, both ends closed, a lamp on its back wall. Walked: its colliders
                    # are moonmere_civic.ts's (the college's walks)
                    wall(-half, half, 0, 3.9, 'LimeS', ha, z=-.55, facing=-1)        # the arcade's inner face
                    with G.at(z=-AMB):
                        wall(-half, half, 0, 3.9, 'Lime')
                        band(0.0, .62, surf='Basalt', x0=-half, x1=half, proud=.04)
                        band(2.95, .12, x0=-half, x1=half, proud=.03)
                        plaque(0.0, 1.65, .55, z=.0)                                    # one, facing the middle arch
                    quad(nm('ambc'), [(-half, 3.9, -.55), (half, 3.9, -.55), (half, 3.9, -AMB), (-half, 3.9, -AMB)], 'TimberD', (0, -1, 0))
                    for xb in [-half + i * 2.0 for i in range(1, int(round(2 * half / 2.0)))]:
                        obox(nm('ambj'), xb - .08, xb + .08, 3.66, 3.9, -AMB, -.55, 'S_oak', omit=('+y', '-z', '+z'))   # its joists (a swatch: never split by the strip's tiles)
                    quad(nm('ambf'), [(-half, .03, -AMB), (half, .03, -AMB), (half, .03, -.55), (-half, .03, -.55)], 'PaleS', (0, 1, 0))
                    for sg in (-1, 1):
                        quad(nm('ambe'), [(sg * half, 0, -.55), (sg * half, 0, -AMB), (sg * half, 3.9, -AMB), (sg * half, 3.9, -.55)], 'Lime', (-sg, 0, 0))
                    mount('lamp', 0, 2.55, -AMB)
            band(4.3, .14, x0=-half, x1=half)
            global FLATWIN
            FLATWIN = True       # the court is seen from the towers and the air: its upper windows painted on
            h2 = [window(x, 5.3, .85, 1.8, 'GlassTall', lintel='Pale') for x in xs]
            wall(-half, half, 4.44, 7.8, 'Lime', h2)
            band(7.74, .14, x0=-half, x1=half)
            h3 = [window(x, 8.6, .8, 1.4, 'GlassTallD', lintel='Pale') for x in xs]
            FLATWIN = False
            wall(-half, half, 7.88, E - .3, 'Lime', h3)
            box(nm('cpl'), -half, half, E - .3, E, -.1, .12, 'Timber')
    # the ring roof
    p = math.tan(math.radians(22)); o = OVH; ye = E + YE
    oc = [(-hx - o, hz + o), (hx + o, hz + o), (hx + o, -hz - o), (-hx - o, -hz - o)]
    rx, rz = (hx + cx_) / 2, (hz + cz_) / 2
    rc = [(-rx, rz), (rx, rz), (rx, -rz), (-rx, -rz)]
    ic = [(-cx_ + o, cz_ - o), (cx_ - o, cz_ - o), (cx_ - o, -cz_ + o), (-cx_ + o, -cz_ + o)]
    run = (hx + o) - rx
    yr = ye + p * run
    for k in range(4):
        a, b = k, (k + 1) % 4
        A0 = (oc[a][0], ye, oc[a][1]); A1 = (oc[b][0], ye, oc[b][1]); R0 = (rc[a][0], yr, rc[a][1]); R1 = (rc[b][0], yr, rc[b][1])
        I0 = (ic[a][0], ye, ic[a][1]); I1 = (ic[b][0], ye, ic[b][1])
        out = Vector(((A0[0] + A1[0]) / 2, 0, (A0[2] + A1[2]) / 2)); out = Vector((1 if abs(out.x) > abs(out.z) and out.x > 0 else -1 if abs(out.x) > abs(out.z) else 0, 0, 0 if abs(out.x) > abs(out.z) else (1 if out.z > 0 else -1)))
        roof_plane([A0, A1, R1, R0], Vector(A1) - Vector(A0), Vector((out.x * p, 1, out.z * p)), surf='PantilePlum')
        roof_plane([I1, I0, R0, R1], Vector(I0) - Vector(I1), Vector((-out.x * p, 1, -out.z * p)), surf='PantilePlum')
        tube(R0, R1, .15, (0, 1, 0), seg=4)
        tube(A0, R0, .12, (0, 1, 0), seg=3)
        eave_edge(A0, A1, out, ye, o, mitre=True)
        eave_edge(I1, I0, -out, ye, o, mitre=-1)
    for (x, z) in ((-12, 10), (12, -10), (12, 10)):
        with G.at(M=T(x, yr - 1.2, z)):
            chimney()


def inn_shell():
    """THE SHELF INN (16 x 12) on piles over the water ("a room over the water and the sound
    of the causeway all night"): a timber deck on iron-banded piles, a banded ground
    storey, a galleried upper storey over the water, a hipped roof with two stacks, its
    sign (a dressing mount). Origin: the footprint centre at the Landing's level (1.0);
    floor 0 is 0.6 above it (the site's 1.6)."""
    hx, hz = 8.0, 6.0; fl = .6; E = 7.8
    # the deck and its piles (the sea at -1.25 absolute is -2.25 here)
    box(nm('deck'), -hx - 1.4, hx + 1.4, fl - .3, fl, -hz - 1.6, hz + 1.2, 'Timber')
    for x in (-hx - 1.0, 0, hx + 1.0):
        for z in (-hz - 1.2, 0, hz + .8):
            lathe(nm('pile'), [(.24, -5.5, True), (.24, fl - .3, True)], 'S_hull', seg=5, cx=x, cz=z, caps=False, smooth=False)
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            gaps, h1, h2 = [], [], []
            xs = [-half + (i + .5) * 2 * half / round(2 * half / 4) for i in range(round(2 * half / 4))]
            for x in xs:
                if k == 0 and abs(x) < 2.1: continue
                h1.append(window(x, fl + 1.0, 1.0, 1.9, 'GlassTall', rise=.25, vous=.26, d=.3))
                h2.append(window(x, 4.9, .9, 1.7, 'GlassTall' if (k + int(x)) % 2 else 'GlassTallD', lintel='Basalt', shutters=True))
            if k == 0:
                Hd = door(0, w=1.5, floor=fl, h=2.7, rise=.45, recess=.6, vous=.38, leaf=False, open_=True, steps=False, sill=False)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                mount('sign', 1.9, 3.9, .05); mount('lamp', -1.4, 3.6, 0)
                h2.append(window(0, 4.9, .9, 1.7, 'GlassTall', lintel='Basalt'))
            wall(-half, half, fl, 1.0, 'Basalt', [h_ for h_ in h1 if h_['c'] < 1.0])
            wall(-half, half, 1.0, 4.2, 'Tufa', h1)
            rule(4.2, x0=-half, x1=half, holes=h2)
            wall(-half, half, 4.2, E - .3, 'Tufa', h2)
            pbox(nm('plate'), -half - .05, half + .05, E - .3, E, -.12, .12, 'Timber')
            quoins(-half, fl, E - .3, -1); quoins(half, fl, E - .3, 1)
            if k == 2:
                # the gallery over the water
                box(nm('gfl'), -half, half, 4.0, 4.15, -.05, 1.2, 'Timber')
                box(nm('grl'), -half, half, 5.05, 5.15, 1.1, 1.2, 'Timber')
                if d0():
                    palings(-half, half, 4.15, 5.05, 1.12, int(2 * half / .3), .06, 'Timber')
                else:
                    card(nm('gbal'), -half, half, 4.15, 5.05, 1.15, 'X_balus', back=True)
                for x in (-half + .5, 0, half - .5):
                    prism(nm('gbr'), [(0, 4.0), (1.15, 4.0), (1.15, 3.9), (.3, 3.4), (0, 3.3)], x - .07, x + .07, 'Timber', axis='x')
    rh = hip_rect(hx, hz, E, pitch=24)
    for x in (-4.5, 4.5):
        with G.at(M=T(x, rh - 1.4, -1.0)):
            chimney()


def bs_shell():
    """THE BURNED SHELF (22 x 14; MM-5: it moved here, beside the Long Tower, where the
    astronomy section burned). A banded hall with the roof GONE over its north half (local
    -x): the wall tops broken and stepped, the bands cracked by heat and offset, soot over
    every window, the burned half's windows empty, charred rafters standing out of the
    surviving roof. The planner washes it burned pink. Ruling 11: it reads as a burn --
    no scaffolding, no neat courses, nothing that looks like work in progress."""
    hx, hz, E, pl = 11.0, 7.0, 9.0, .6
    rng = __import__('random').Random(907)
    for k, M in enumerate(face_frames(0, 0, 0)):
        half = hx if k % 2 == 0 else hz
        dist = hz if k % 2 == 0 else hx
        with G.at(M=M @ T(0, 0, dist)):
            # which local x of this face lies over the burned (north, module -x) half
            def burned(x):
                if k == 0: return x < 0
                if k == 2: return x > 0
                return k == 3
            n = int(round(2 * half / 4.4))
            xs = [-half + (i + .5) * 2 * half / n for i in range(n)]
            gaps, h1 = [], []
            for x in xs:
                if k == 0 and abs(x) < 1.6: continue
                b = burned(x)
                H = hole(x - .65, x + .65, 1.9, 5.6, .4, 9)
                h1.append(H)
                reveal(H, 0, .4, 'PaleS', head_from=None if far() else -.2)
                infill(H, -.4, 'S_char' if b else 'GlassHall')
                voussoirs(H, .36, .06, -.2, n=9, surfs=('Pale', 'Basalt'))
                if not far():
                    # (A-13: one of three soot shapes a window, mirrored or not -- five identical blots
                    # stood in a row over the facade's windows; a touch wider or narrower each)
                    sw = rng.uniform(.85, 1.15)
                    soot_panel([(x - sw, 5.3, .07), (x + sw, 5.3, .07), (x + sw, 7.4 if b else 6.4, .07), (x - sw, 7.4 if b else 6.4, .07)], (0, 0, 1), rng)
            if k == 0:
                Hd = door(0, w=1.8, floor=pl, h=3.2, rise=.55, recess=.9, vous=.46, leaf=False, open_=True)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                soot_panel([(-1.6, 3.9, .3), (1.6, 3.9, .3), (1.6, 6.2, .3), (-1.6, 6.2, .3)], (0, 0, 1), rng)
            plinth(-half, half, pl, gaps=gaps)
            wall(-half, half, pl, 6.85, 'TufaB', h1)          # to 6.85: the cracked band's gaps show wall, not sky
            # the band at 6.6, CRACKED: offset blocks with gaps, missing over the burned half
            x = -half
            while x < half - .05:
                L = rng.uniform(.8, 2.4); xb = min(half, x + L)
                if not (burned((x + xb) / 2) and rng.random() < .45):
                    dy = rng.uniform(-.05, .05) * (2 if burned((x + xb) / 2) else 1)
                    pbox(nm('cband'), x + .03, xb - .03, 6.6 + dy, 6.85 + dy, -.06, .05 + rng.uniform(0, .04), 'Basalt', lean='front_top')
                x = xb + rng.uniform(.03, .12)
            # a second cracked course at 4.2, the Alchemists' storey line carried on across the
            # shared wall (review: the two fronts' bands stepped at the joint), cut by the windows
            x = -half
            while x < half - .05:
                L = rng.uniform(.7, 2.0); xb = min(half, x + L)
                if not any(H['a'] - .15 < xb and H['b'] + .15 > x for H in h1) and not (burned((x + xb) / 2) and rng.random() < .3):
                    dy = rng.uniform(-.04, .04) * (2 if burned((x + xb) / 2) else 1)
                    pbox(nm('cband'), x + .03, xb - .03, 4.1 + dy, 4.3 + dy, -.06, .05, 'Basalt', lean='front_top')
                x = xb + rng.uniform(.03, .12)
            # the upper wall: whole over the roofed half; over the burned half BROKEN along one
            # ragged sloping line (review 2026-10-06, ruling 11: the old flat-topped steps read as
            # unfinished courses or battlements). The line is a function of the WORLD position,
            # so it is continuous round the corners, and it rises to the eave toward the roofed half.
            wxf = {0: lambda x: x, 1: lambda x: hx, 2: lambda x: -x, 3: lambda x: -hx}[k]
            wzf = {0: lambda x: hz, 1: lambda x: -x, 2: lambda x: -hz, 3: lambda x: x}[k]

            def broken_top(x):
                wx, wz = wxf(x), wzf(x)
                h = 7.75 + .55 * math.sin(1.3 * wx + .7) + .35 * math.sin(2.9 * wz + 1.1 * wx + 2.0) + .3 * math.sin(5.3 * wx - 3.1 * wz)
                h = min(8.6, max(6.95, h))
                w = min(1.0, max(0.0, -wx / 2.4))
                return E * (1 - w) + h * w
            spans = {0: [(-half, 0.0, True), (0.0, half, False)], 1: [(-half, half, False)],
                     2: [(-half, 0.0, False), (0.0, half, True)], 3: [(-half, half, True)]}[k]
            for xa, xb, isb in spans:
                if not isb:
                    wall(xa, xb, 6.85, E, 'TufaB')
                    pbox(nm('plate'), xa, xb, E - .3, E, -.12, .12, 'Timber', lean='front')
                    continue
                xs_ = [xa]
                while xs_[-1] < xb - .4:
                    xs_.append(min(xb, xs_[-1] + rng.uniform(.45, 1.25)))
                xs_[-1] = xb
                ys_ = [max(6.97, broken_top(x_) - (rng.uniform(.1, .45) if 0 < n_ < len(xs_) - 1 and n_ % 2 else 0)) for n_, x_ in enumerate(xs_)]
                for (x0_, y0_), (x1_, y1_) in zip(zip(xs_, ys_), zip(xs_[1:], ys_[1:])):
                    quad(nm('bw'), [(x0_, 6.85, 0), (x1_, 6.85, 0), (x1_, y1_, 0), (x0_, y0_, 0)], 'TufaB', (0, 0, 1))
                    quad(nm('bwi'), [(x1_, 6.85, -.7), (x0_, 6.85, -.7), (x0_, y0_, -.7), (x1_, y1_, -.7)], 'TufaC', (0, 0, -1))   # (A-13: smoke-dark, as bs_in's lining)
                    nrm = Vector((-(y1_ - y0_), x1_ - x0_, 0)).normalized()
                    quad(nm('brk'), [(x0_, y0_, 0), (x1_, y1_, 0), (x1_, y1_, -.7), (x0_, y0_, -.7)], 'S_char', tuple(nrm))
                # the inside face below the break, seen through the missing roof
                with G.at(z=-.7):
                    if k == 0 and xa < .95 and xb > -.95:
                        for a_, b_ in ((xa, max(xa, -.95)), (min(xb, .95), xb)):
                            if b_ - a_ > .02: wall(a_, b_, pl, 4.6, 'TufaC', z=0, facing=-1)
                        wall(xa, xb, 4.6, 6.85, 'TufaC', z=0, facing=-1)
                    else:
                        wall(xa, xb, pl, 6.85, 'TufaC', z=0, facing=-1)
    # the surviving roof over the south half (module x 0..11), its broken edge at x = 0
    p = math.tan(math.radians(22)); o = OVH; ye = E + YE
    X0, X1, Z = -.3, hx + o, hz + o
    rh = ye + p * Z
    roof_plane([(X0, ye, Z), (X1, ye, Z), (X1 - Z, rh, 0), (X0, rh, 0)], (1, 0, 0), Vector((0, 1, p)))
    roof_plane([(X1, ye, -Z), (X0, ye, -Z), (X0, rh, 0), (X1 - Z, rh, 0)], (-1, 0, 0), Vector((0, 1, -p)))
    roof_plane([(X1, ye, Z), (X1, ye, -Z), (X1 - Z, rh, 0)], (0, 0, -1), Vector((p, 1, 0)))
    tube((X0, rh + .02, 0), (X1 - Z, rh + .02, 0), .15, (0, 1, 0))
    eave_edge((X0, ye, Z), (X1, ye, Z), (0, 0, 1), ye, o, mitre=(False, True))
    eave_edge((X1, ye, -Z), (X0, ye, -Z), (0, 0, -1), ye, o, mitre=(True, False))
    eave_edge((X1, ye, Z), (X1, ye, -Z), (1, 0, 0), ye, o, mitre=True)
    # the broken edge: a charred gable of boards, rafters standing out black over the hall
    quad(nm('bedge'), [(X0, ye - .3, -Z + .6), (X0, ye - .3, Z - .6), (X0, rh - .2, 0)][::-1], 'S_char', (-1, 0, 0))
    for z in (-5.4, -3.2, -1.1, 1.0, 3.3, 5.5):
        L = rng.uniform(1.4, 3.2)
        y0 = ye + p * (Z - abs(z)) - .25
        with G.at(M=T(X0, y0, z) @ RY(math.pi / 2) @ Matrix.Rotation(rng.uniform(-.25, .15), 4, 'X')):
            box(nm('raft'), -.08, .08, -.1, .1, 0, L, 'S_char')
    for x in (-8.0, -4.5):
        box(nm('beam'), x - .12, x + .12, E - .5, E - .2, -hz + .3, hz - .3, 'S_char')


def al_shell():
    """THE ALCHEMISTS (12 x 12), sharing the Burned Shelf's north wall ("the burned shelf
    next door"): a small banded hall, grilled windows, and a tall basalt furnace stack with
    a cowl rising through its roof."""
    hx, hz, E, pl = 6.0, 6.0, 8.0, .6
    for k, M in enumerate(face_frames(0, 0, 0)):
        with G.at(M=M @ T(0, 0, hz)):
            gaps, h1, h2 = [], [], []
            for x in (-3.4, 3.4) if k == 0 else (-3.0, 0.0, 3.0):
                h1.append(window(x, 2.1, .8, 1.5, 'GlassHigh', d=.35, lintel='Basalt', sill_slab=False, grille=True))
                h2.append(window(x, 5.0, .8, 1.5, 'GlassTallD', lintel='Basalt'))
            if k == 0:
                Hd = door(0, w=1.5, floor=pl, h=2.8, rise=.45, recess=.8, vous=.4, leaf=False, open_=True)
                gaps.append((Hd['a'] - .02, Hd['b'] + .02)); h1.append(Hd)
                mount('sign', 1.4, 3.9, .05); mount('lamp', -1.4, 3.6, 0)
                plaque(0, 5.5, .5)
            plinth(-hx, hx, pl, gaps=gaps)
            wall(-hx, hx, pl, 4.2, 'Tufa', h1)
            rule(4.2, x0=-hx, x1=hx, holes=h2)
            wall(-hx, hx, 4.2, E - .3, 'Tufa', h2)
            box(nm('plate'), -hx - .05, hx + .05, E - .3, E, -.12, .12, 'Timber')
            quoins(-hx, pl, E - .3, -1); quoins(hx, pl, E - .3, 1)
    rh = hip_rect(hx, hz, E, pitch=26)
    # the furnace stack: basalt, banded, a tiled cowl, soot at its lip
    sx, sz = -2.5, -2.5
    box(nm('stk'), sx - .9, sx + .9, E - 1.0, rh + 3.2, sz - .9, sz + .9, 'Basalt')
    for y in (rh - .5, rh + 1.6):
        box(nm('stb'), sx - 1.0, sx + 1.0, y, y + .25, sz - 1.0, sz + 1.0, 'Pale')
    box(nm('stc'), sx - 1.05, sx + 1.05, rh + 3.2, rh + 3.35, sz - 1.05, sz + 1.05, 'Pale')
    for x in (-.45, .45):
        box(nm('stp'), sx + x - .2, sx + x + .2, rh + 3.35, rh + 3.9, sz - .2, sz + .2, 'S_soot')
    # (A-13: its own swatch, black under the cap and thinning DOWN -- the rising lick put the dark band
    # a metre below the lip)
    quad(nm('sts'), [(sx - .91, rh + 2.2, sz + .91), (sx + .91, rh + 2.2, sz + .91), (sx + .91, rh + 3.2, sz + .91), (sx - .91, rh + 3.2, sz + .91)], 'R_scorch_lip', (0, 0, 1))


def sl_shell():
    """THE SEA LAMP (6 x 6, about 16 m) on the west horn of the mouth, at quay level: a
    banded lamp tower, a gallery on corbels, a glazed lantern round a lamp core (MC_Glow,
    a glow member: the harbour's one light that is not a window) under a copper cap."""
    hw = 3.0; H = 12.0
    for k, M in enumerate(face_frames(0, 0, hw)):
        with G.at(M=M):
            with G.at(M=Matrix(((1, 0, 0, 0), (0, 1, 0, 0), (0, -.35 / H, 1, .35), (0, 0, 0, 1)))):
                hs = []
                if k == 0:
                    hs.append(door(0, w=1.1, floor=.3, h=2.3, rise=.35, recess=.7, vous=.3))
                wall(-hw - .35, hw + .35, -POD, 4.0, 'Basalt', hs)
                hs2 = [window(0, 6.0, .5, 1.2, 'GlassHigh', d=.3, lintel='Pale', sill_slab=False)]
                wall(-hw - .2, hw + .2, 4.0, H, 'Tufa', hs2)
            # the gallery's iron railing (S2 review, LOOKED from the hard, the water and the air: a lone
            # top rail with nothing under it -- the palings were LOD0 only and sl_shell is built at
            # MID -- read as a thin black frame floating off the cornice): standards on the
            # cornice's edge every 0.95 m and at the corners, a top rail and a bottom rail between
            # them, the palings at LOD0 as before
            rz0, rz1 = .6, .68
            box(nm('slr'), -hw - .68, hw + .68, H + 1.85, H + 1.93, rz0, rz1, 'S_iron')
            box(nm('slrb'), -hw - .68, hw + .68, H + .95, H + 1.0, rz0, rz1, 'S_iron')
            for i in range(7):
                x = -hw - .64 + i * (2 * hw + 1.28) / 6
                obox(nm('slp'), x - .035, x + .035, H + .85, H + 1.93, rz0 - .005, rz1 + .005, 'S_iron', omit=('-y', '+y'))
            if d0():
                palings(-hw - .68, hw + .68, H + 1.0, H + 1.85, .64, 15, .03, 'S_iron', sides=False)
            # the lantern: four glazed lights round the lamp
            with G.at(z=-1.4):
                quad(nm('sll'), [(-1.4, H + .85, 0), (1.4, H + .85, 0), (1.4, H + 3.2, 0), (-1.4, H + 3.2, 0)], 'GlassTall', (0, 0, 1))
                for x in (-1.45, 1.45):
                    box(nm('slm'), x - .08, x + .08, H + .85, H + 3.3, -.08, .08, 'Timber')
            mount('lamp', 0, 3.2, 0)
    # bands round the battered shaft and the corbelled gallery as mitred rings (review: four
    # boxes a course overlapped at the corners, and the top course z-fought the gallery floor)
    bat = lambda y: hw + .35 * (1 - y / H)
    for y in (4.0, 7.6, 10.4):
        ring_course(bat(y + .3), bat(y) + .05, y, y + .3, 'Basalt', top_in=bat(y + .3), bot_in=bat(y))
    cs = ((H, H + .3, .3, 'Pale'), (H + .3, H + .55, .55, 'Basalt'), (H + .55, H + .85, .8, 'Pale'))
    for i, (ya, yb_, out, sf) in enumerate(cs):
        nxt = cs[i + 1][2] if i + 1 < len(cs) else None
        prv = cs[i - 1][2] if i else 0.0
        ring_course(hw, hw + out, ya, yb_, sf, top_in=hw + nxt if nxt else hw, bot_in=hw + prv, top=nxt is not None)
    quad(nm('slf'), [(-hw - .8, H + .85, hw + .8), (hw + .8, H + .85, hw + .8), (hw + .8, H + .85, -hw - .8), (-hw - .8, H + .85, -hw - .8)], 'Pale', (0, 1, 0))
    lathe(nm('core'), [(0, H + 1.2, False), (.55, H + 1.5, True), (.55, H + 2.6, True), (0, H + 2.9, False)], 'Glow', seg=8)
    hip_rect(1.6, 1.6, H + 3.3, o=.5, pitch=40, brackets=False, surf='Copper')
    lathe(nm('slfin'), [(.08, H + 5.0, True), (.08, H + 5.8, True), (.18, H + 5.95, True), (0, H + 6.3, False)], 'Brass', seg=6)


def bh_bay():
    """One boathouse bay (4.6 x 10) on the east horn, on the water: a boat arch to the mere,
    a slip inside, banded piers, a gable to the water under a glazed roof -- three in a row
    make a sawtooth of gables. Origin: the bay's centre on the quay line at quay level."""
    hw, dep = 2.3, 10.0; zw = -2.25
    Ha = hole(-1.8, 1.8, zw, 2.6, .9, 10)
    with G.at(z=dep / 2):
        wall(-hw, hw, -4.5, 6.0, 'Tufa', [Ha])
        voussoirs(Ha, .4, .08, -.3, n=11)
        reveal(Ha, 0, .5, 'PaleS', sill=False, head_from=None if far() else -.3)
        box(nm('wl'), -hw, hw, zw - .1, zw + .15, -.05, .08, 'Basalt')
        # the gable to the water, its verge and an oculus
        p = math.tan(math.radians(30))
        quad(nm('gab'), [(-hw, 6.0, 0), (hw, 6.0, 0), (0, 6.0 + p * hw, 0)], 'Tufa', (0, 0, 1))
        quad(nm('ocu'), [(-.35, 6.25, .02), (.35, 6.25, .02), (.35, 6.95, .02), (-.35, 6.95, .02)], 'GlassRound', (0, 0, 1))
        band(5.8, .22, x0=-hw, x1=hw)
        mount('lamp', 0, 3.8, 0)
    # S2 (the Mere at full density; LOOKED: from the hard and the mouth a boathouse was a blank
    # gold box, its back and sides bare tufa and its back gable open to the sky): the SIDES carry
    # two high lights each under a basalt base course, the BACK a boarded wicket door under a
    # banded arch, a lit niche beside it, and its own gable with an oculus
    for s in (-1, 1):
        with G.at(M=T(s * hw, 0, 0) @ RY(s * math.pi / 2)):
            hs = [window(x, 3.3, .75, 1.25, 'GlassHigh', d=.22, rise=.3, vous=.24, n=5) for x in (-2.2, 1.6)]
            wall(-dep / 2, dep / 2, -4.5, 6.0, 'Tufa', hs)
            band(2.9, .25, x0=-dep / 2, x1=dep / 2)
            band(0.0, .55, surf='Basalt', x0=-dep / 2, x1=dep / 2 - .45, proud=.03)
            box(nm('pier'), dep / 2 - .45, dep / 2 + .06, -4.5, 6.0, -.05, .25, 'Pale')     # proud of the gable wall, not in its plane
    with G.at(M=T(0, 0, -dep / 2) @ RY(math.pi)):
        # (S2 review: the wicket stood open, and through it from the mere the hard's bank showed as a ledge: its leaves shut)
        Hd = door(-.4, w=1.3, floor=0.0, h=2.3, rise=.45, recess=.35, vous=.3, steps=False, leaf=True, fan=False)
        Hn = lamp_niche(1.35, 1.5)
        wall(-hw, hw, -4.5, 6.0, 'Tufa', [Hd] + ([Hn] if Hn else []))
        band(3.3, .25, x0=-hw, x1=hw)
        for a_, b_ in ((-hw, -1.1), (.3, hw)):
            band(0.0, .55, surf='Basalt', x0=a_, x1=b_, proud=.03)
        p = math.tan(math.radians(30))
        quad(nm('gbb'), [(-hw, 6.0, 0), (hw, 6.0, 0), (0, 6.0 + p * hw, 0)], 'Tufa', (0, 0, 1))
        quad(nm('ocb'), [(-.3, 6.2, .02), (.3, 6.2, .02), (.3, 6.8, .02), (-.3, 6.8, .02)], 'GlassRound', (0, 0, 1))
        band(5.8, .22, x0=-hw, x1=hw)
    # S2 (LOOKED from the mere: through a boat arch the back wall, the sides and the roof were
    # single-sided, so the hard and the sky showed through the boathouse): the inside lined --
    # the walls' inner faces in shaded tufa (the arch's, the wicket's and the lights' openings
    # kept), the gables' inner faces, the roof's boarded underside
    if not far():
        with G.at(z=dep / 2 - .3):
            wall(-hw + .3, hw - .3, zw, 6.0, 'TufaS', [Ha], facing=-1)
            quad(nm('gbi'), [(hw - .3, 6.0, 0), (-hw + .3, 6.0, 0), (0, 6.0 + math.tan(math.radians(30)) * (hw - .3), 0)], 'TufaS', (0, 0, -1))
        with G.at(M=T(0, 0, -dep / 2 + .3) @ RY(math.pi)):
            wall(-hw + .3, hw - .3, zw, 6.0, 'TufaS', [Hd], facing=-1)
            # (the wicket's leaves are a joinery mount, single-sided, drawn to the hard: from the
            # mere, through the boat arch, the doorway stood open on the bank -- its inside boarded)
            infill(Hd, .04, 'R_door_oak', facing=-1)
            quad(nm('gbj'), [(hw - .3, 6.0, 0), (-hw + .3, 6.0, 0), (0, 6.0 + math.tan(math.radians(30)) * (hw - .3), 0)], 'TufaS', (0, 0, -1))
        for s_ in (-1, 1):
            with G.at(M=T(s_ * (hw - .3), 0, 0) @ RY(s_ * math.pi / 2)):
                # (the two high lights' openings, as the outer face's window() cut them)
                wall(-dep / 2 + .3, dep / 2 - .3, zw, 6.0, 'TufaS', [hole(x - .375, x + .375, 3.3, 4.25, .3, 5) for x in (-2.2, 1.6)], facing=-1)
        pi_ = math.tan(math.radians(30))
        for s_ in (-1, 1):
            q = [(s_ * (hw - .3), 6.0 + .02, -dep / 2 + .3), (0, 6.0 + pi_ * hw - .02, -dep / 2 + .3), (0, 6.0 + pi_ * hw - .02, dep / 2 - .3), (s_ * (hw - .3), 6.0 + .02, dep / 2 - .3)]
            quad(nm('rfu'), q if s_ < 0 else q[::-1], 'TimberD', (s_ * -.5, -1, 0))
    # (S2 review, LOOKED from the mere: either side of the slip and behind it the bay had no floor,
    # and the horn's bank stood up in it as a pale ledge) a stone landing across the back of the
    # bay and a basalt ledge either side of the slip, down into the water
    if not far():
        obox(nm('lnd'), -hw + .3, hw - .3, zw + .2, 0.0, -dep / 2 + .3, -dep / 2 + 1.8, 'Pale', omit=('-y', '-z'))
        for s_ in (-1, 1):
            obox(nm('sled'), min(s_ * 1.6, s_ * (hw - .3)), max(s_ * 1.6, s_ * (hw - .3)), zw - .3, -.1, -dep / 2 + 1.8, dep / 2 - .3, 'S_iron', omit=('-y', '-z', '+z'))
    # inside: the slip, the water's dark, the roof's underside
    prism(nm('slip'), [(-dep / 2 + .5, 0), (dep / 2 - .6, zw - .3), (dep / 2 - .6, zw - .5), (-dep / 2 + .5, -.2)], -1.6, 1.6, 'Timber', axis='x')
    quad(nm('dark'), [(-hw, zw + .02, dep / 2), (hw, zw + .02, dep / 2), (hw, zw + .02, -dep / 2), (-hw, zw + .02, -dep / 2)], 'S_water', (0, 1, 0))
    # THE ROOF (S2 review, LOOKED from the hard and the mere: thin floating hairlines and loose dark
    # slivers above and between the gables -- the single-sided roof planes ran 0.6 m past each gable
    # with nothing under them, and the long eaves' fascias, 0.6 m out, stood inside the next bay's
    # roof and poked past its gable as dark timber ends). The three bays now abut exactly (the
    # planner stretches a bay to its third of the row's width, moonmere_civic.ts), so a long side
    # is a party line: the slopes stop 0.15 past the wall over a lead box gutter -- on a row's
    # outer side its eave gutter, between two bays the valley gutter they share -- and at each
    # gable the verge oversails 0.6 m, closed by a barge board along both rakes and a boarded
    # soffit under the oversail
    p = math.tan(math.radians(30)); os_, og = .15, .6
    ye = 6.0 + .1
    yr = ye + p * hw
    for s in (-1, 1):
        roof_plane([(s * (hw + os_), ye - p * os_, dep / 2 + og), (0, yr, dep / 2 + og), (0, yr, -dep / 2 - og), (s * (hw + os_), ye - p * os_, -dep / 2 - og)][::(1 if s > 0 else -1)],
                   (0, 0, -s), Vector((s * p, 1, 0)))
    tube((0, yr + .02, dep / 2 + og), (0, yr + .02, -dep / 2 - og), .14, (0, 1, 0))
    for s in (-1, 1):
        # the gutter: its outer lip, its sole and its inner face, the full length of the eave
        obox(nm('gut'), s * (hw - .1) if s > 0 else -(hw + .26), (hw + .26) if s > 0 else -(hw - .1), ye - p * os_ - .3, ye - p * os_ - .06,
             -dep / 2 - og, dep / 2 + og, 'S_iron', omit=('-z', '+z'))     # (lead: a swatch, never split by the strip's tiles)
        for zg in (-1, 1):
            # the barge board along the rake, and the oversail's boarded soffit
            zb = zg * (dep / 2 + og)
            A0 = (s * (hw + os_), ye - p * os_); A1 = (0, yr)
            q = [(A0[0], A0[1] - .26, zb), (A1[0], A1[1] - .26, zb), (A1[0], A1[1] + .04, zb), (A0[0], A0[1] + .04, zb)]
            quad(nm('bbo'), q, 'Timber', (0, 0, zg))
            z0_, z1_ = zg * dep / 2, zb
            quad(nm('vsf'), [(A0[0], A0[1] - .02, z0_), (A1[0], A1[1] - .02, z0_), (A1[0], A1[1] - .02, z1_), (A0[0], A0[1] - .02, z1_)], 'TimberD', (s * -p, -1, 0))


# ====================================================================== interiors (near only)
# Each interior records the frame Track P's planners need (MOONMERE.md section 4,
# `interiors.<template>`: floors, stairs as ramps, holes, rooms, walls, doors), in its LOCAL
# frame, into manifest.json `files.<name>.interior`. The generator reads client/src/
# moonmere-layout.json#interiors when it exists and builds to it; until then the
# contract's defaults (section 5) below hold.
INTERIOR = {}


def _layout_interiors():
    try:
        return json.loads(LAYOUT_PATH.read_text()).get('interiors', {}) or {}
    except Exception:
        return {}


LAYOUT_INTERIORS = _layout_interiors()


def _r3(v):
    if isinstance(v, float): return round(v, 3) + 0.0
    if isinstance(v, (list, tuple)): return [_r3(x) for x in v]
    if isinstance(v, dict): return {k: _r3(x) for k, x in v.items()}
    return v


def record(name, **kw):
    INTERIOR[name] = {k: _r3(v) for k, v in kw.items()}


def ramp(x0, z0, y0, x1, z1, y1, half):
    return {'x0': round(x0, 3), 'z0': round(z0, 3), 'y0': round(y0, 3), 'x1': round(x1, 3), 'z1': round(z1, 3), 'y1': round(y1, 3), 'half': half}


# THE FOOT RULE (Philip 2026-10-09, "need some more clearance at the bottom of the stairs, it
# affects many stairs in many moonmere buildings": the Registry's first riser stood 0.6 m from its
# end wall, the Archive's and the Inn's 0.8). A flight's foot has FOOT_CLEAR of open floor ahead of
# its first riser across its whole width -- one flight width: the classical landing, and the Long
# Tower's contracted corner square (D-14) -- and FOOT_SIDE beside it on any OPEN side (an edge more
# than FOOT_CLOSED off the room's lining), from FOOT_CLEAR back to FOOT_SIDE_UP up the run (where
# stairBodyHit still lets a walker step on from the side), from the floor to FOOT_H. Nothing stands
# under a flight or in the hole it arrives through. foot_check() measures every flight_rec flight
# of the template just built, writes the numbers into its record (`feet`), and REFUSES to build a
# template that breaks the rule, naming the flight and what is in the way. The number is changed
# here, never per building (moonmere_stair_feet.test.mjs holds it again on the records and on the
# planners' colliders).
FOOT_CLEAR = 1.2
FOOT_SIDE = 0.6
FOOT_SIDE_UP = 0.3
FOOT_CLOSED = 0.25
FOOT_H = 2.0
# every flight_rec of the template being built: (n0, n1, x0, z0, x1, z1, y0, y1, width); the
# flight's own parts are the objects nm() numbered in (n0, n1]
FLIGHTS = []


def flight_rec(x0, z0, x1, z1, y0, y1, width=1.2):
    """Build an interior flight and return its ramp (along the nosing line, a 0.05 end pad:
    CITY-BUILD "Colliders")."""
    n0 = N[0]
    int_flight(x0, z0, x1, z1, y0, y1, width=width)
    FLIGHTS.append((n0, N[0], x0, z0, x1, z1, y0, y1, width))
    L = math.hypot(x1 - x0, z1 - z0); ux, uz = (x1 - x0) / L, (z1 - z0) / L
    return ramp(x0 - ux * .05, z0 - uz * .05, y0, x1 + ux * .05, z1 + uz * .05, y1, width / 2)


def _obj_num(name):
    """The nm() number of a part ('tr12' -> 12, a Blender '.001' suffix dropped), else None."""
    import re
    m = re.match(r'^[A-Za-z_]+?(\d+)(?:\.\d+)?$', name)
    return int(m.group(1)) if m else None


def _module_aabb(o):
    """An object's bounds (x0, x1, y0, y1, z0, z1) in the MODULE frame: module (x, y, z) =
    Blender (X, Z, -Y), the inverse of mesh()'s (x, -z, y)."""
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [p.x for p in pts]; ys = [p.z for p in pts]; zs = [-p.y for p in pts]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def foot_check(name):
    """THE FOOT RULE (FOOT_CLEAR), measured on what was drawn. Writes INTERIOR[name]['feet'] -- one
    {front, left, right, closed} a flight, in `stairs` order; left and right as a walker facing up
    the flight sees them, measured 0.3 m before the first riser, each capped at 3 m -- and raises
    on a violation. Every MESH of the module is an obstacle except the flight's own parts and a
    sheet (a lining, a painted window, a floor, a rug: under 0.01 m in some axis), so there is no
    list of names to keep."""
    rec = INTERIOR[name]
    floors = rec['floors']; rooms = rec.get('rooms', []); holes = rec.get('holes', [])
    walls = rec.get('walls', [])
    # (the floor a record's walls stand on is its `wallFloor` -- the Long Tower's partition and annex
    # wall on floor 1, every other template's on floor 0; moonmere_civic.ts and
    # moonmere_stair_feet.test.mjs read the same field)
    wall_floor = rec.get('wallFloor', 0)
    if len(FLIGHTS) != len(rec.get('stairs', [])):
        raise RuntimeError(f'{name}: {len(FLIGHTS)} flight_rec flights against {len(rec.get("stairs", []))} recorded stairs')
    objs = [(o.name, _obj_num(o.name), _module_aabb(o)) for o in G.COL.objects if o.type == 'MESH']
    TOL = .01
    fl = []
    for (n0, n1, x0, z0, x1, z1, y0, y1, width) in FLIGHTS:
        L = math.hypot(x1 - x0, z1 - z0); ux, uz = (x1 - x0) / L, (z1 - z0) / L
        if not (abs(ux) > .999 or abs(uz) > .999):
            raise RuntimeError(f'{name}: foot_check measures axis-aligned flights, got ({ux:.3f}, {uz:.3f})')
        fl.append(dict(n0=n0, n1=n1, x0=x0, z0=z0, x1=x1, z1=z1, y0=y0, y1=y1, hw=width / 2, ux=ux, uz=uz, L=L,
                       rx=uz, rz=-ux, k=min(range(len(floors)), key=lambda i: abs(floors[i] - y0)),
                       kt=min(range(len(floors)), key=lambda i: abs(floors[i] - y1))))

    def own(f, num): return num is not None and f['n0'] < num <= f['n1']

    def sheet(a): return min(a[1] - a[0], a[3] - a[2], a[5] - a[4]) < TOL

    # THE SELF-TEST FIRST: each flight's own treads (`tr`) stand where its record says. An axis or
    # sign slip in the frame conversion would otherwise make every clearance below a fiction.
    for i, f in enumerate(fl):
        tr = [a for (nme, num, a) in objs if own(f, num) and nme.startswith('tr')]
        if len(tr) != 1: raise RuntimeError(f'{name} flight {i}: {len(tr)} tread meshes among its parts')
        bx = sorted((f['x0'], f['x1'])); bz = sorted((f['z0'], f['z1']))
        hx = f['hw'] if abs(f['uz']) > .999 else 0.0; hz = f['hw'] if abs(f['ux']) > .999 else 0.0
        want = (bx[0] - hx, bx[1] + hx, f['y0'] - .3, f['y1'], bz[0] - hz, bz[1] + hz)
        if any(abs(p - q) > .02 for p, q in zip(tr[0], want)):
            raise RuntimeError(f'{name} flight {i}: its treads measure {tuple(round(v, 3) for v in tr[0])}, its record says '
                               f'{tuple(round(v, 3) for v in want)} -- the frame conversion is wrong')

    def room_for(f):
        rs = [r for r in rooms if abs(r[4] - floors[f['k']]) < .01]
        return rs[0] if rs else None

    def zone(f, s0, s1, t0, t1):
        """The AABB (x0, x1, z0, z1) of s in [s0, s1] along the run from the first riser and t in
        [t0, t1] across it (+t the walker's right, facing up)."""
        xs = [f['x0'] + f['ux'] * s + f['rx'] * t for s in (s0, s1) for t in (t0, t1)]
        zs = [f['z0'] + f['uz'] * s + f['rz'] * t for s in (s0, s1) for t in (t0, t1)]
        return (min(xs), max(xs), min(zs), max(zs))

    def ov(a0, a1, b0, b1): return min(a1, b1) - max(a0, b0)

    def blocker(i, f, zb):
        """What occupies zb (x0, x1, z0, z1) on flight i's floor between floor + 0.05 and FOOT_H:
        the room's edge, a hole, another flight's band, a recorded wall, or a module object."""
        y = floors[f['k']]
        r = room_for(f)
        if r is None or zb[0] < r[0] - .005 or zb[1] > r[2] + .005 or zb[2] < r[1] - .005 or zb[3] > r[3] + .005:
            return "the room's lining"
        for h in holes:
            if h[0] == f['k'] and ov(zb[0], zb[1], h[1], h[3]) > TOL and ov(zb[2], zb[3], h[2], h[4]) > TOL:
                return f'the hole {h}'
        for j, g in enumerate(fl):
            if j == i or g['k'] != f['k']: continue
            gb = zone(g, 0, g['L'], -g['hw'], g['hw'])
            if ov(zb[0], zb[1], gb[0], gb[1]) > TOL and ov(zb[2], zb[3], gb[2], gb[3]) > TOL:
                return f'flight {j}'
        for w in walls if f['k'] == wall_floor else ():
            if ov(zb[0], zb[1], w[0], w[2]) > TOL and ov(zb[2], zb[3], w[1], w[3]) > TOL:
                return f'the wall {w}'
        for (nme, num, a) in objs:
            if own(f, num): continue
            if ov(zb[0], zb[1], a[0], a[1]) > TOL and ov(y + .05, y + FOOT_H, a[2], a[3]) > TOL and ov(zb[2], zb[3], a[4], a[5]) > TOL:
                return nme
        return None

    def march(i, f, along, cap=3.0):
        """The least clear distance on 5 lines, 0.02 at a step, 0.05 wide (the 0.01 overlap
        tolerance needs a probe wider than it): 'front' back from the first riser across the
        width; 'L' / 'R' out from the flight's edge, about 0.3 m before the riser."""
        best, what = cap, None
        for q in range(5):
            c = (-f['hw'] + .03 + (2 * f['hw'] - .06) * q / 4) if along == 'front' else (-.3 + (q - 2) * .05)
            d = 0.0
            while d < cap - 1e-9:
                d2 = d + .02
                if along == 'front': zb = zone(f, -d2, -d, c - .025, c + .025)
                elif along == 'R': zb = zone(f, c - .025, c + .025, f['hw'] + d, f['hw'] + d2)
                else: zb = zone(f, c - .025, c + .025, -f['hw'] - d2, -f['hw'] - d)
                b = blocker(i, f, zb)
                if b:
                    if d < best: best, what = d, b
                    break
                d = d2
        return round(best, 3), what

    feet, bad = [], []
    for i, f in enumerate(fl):
        y = floors[f['k']]; rise = f['y1'] - f['y0']
        front, fw = march(i, f, 'front')
        right, rw = march(i, f, 'R')
        left, lw = march(i, f, 'L')
        r = room_for(f)

        def lining_gap(sg):
            ex, ez = f['x0'] + f['rx'] * sg * f['hw'], f['z0'] + f['rz'] * sg * f['hw']
            dx, dz = f['rx'] * sg, f['rz'] * sg
            if abs(dx) > .5: return (r[2] - ex) if dx > 0 else (ex - r[0])
            return (r[3] - ez) if dz > 0 else (ez - r[1])
        closed = [s for s, sg in (('left', -1), ('right', 1)) if lining_gap(sg) <= FOOT_CLOSED + 1e-6]
        feet.append({'front': front, 'left': left, 'right': right, 'closed': closed})
        why = []
        if front < FOOT_CLEAR - .005:
            why.append(f'{front} m of open floor ahead of the first riser (want {FOOT_CLEAR}), stopped by {fw}')
        else:
            b = blocker(i, f, zone(f, -FOOT_CLEAR + .005, 0, -f['hw'] + .005, f['hw'] - .005))
            if b: why.append(f'its foot box holds {b}')
        for side, sg, d, w in (('left', -1, left, lw), ('right', 1, right, rw)):
            if side in closed: continue
            if d < FOOT_SIDE - .005: why.append(f'{d} m beside its open {side} side (want {FOOT_SIDE}), stopped by {w}')
            t0, t1 = (f['hw'] + .005, f['hw'] + FOOT_SIDE - .005) if sg > 0 else (-f['hw'] - FOOT_SIDE + .005, -f['hw'] - .005)
            b = blocker(i, f, zone(f, -FOOT_CLEAR + .005, FOOT_SIDE_UP, t0, t1))
            if b: why.append(f'its open {side} side strip holds {b}')
        # UNDER: nothing standing on this floor inside the flight's footprint reaches its underside
        # (y - 0.3 + s * rise / run: int_flight's soffit) less 0.05, at the overlap's lowest s
        fp = zone(f, 0, f['L'], -f['hw'], f['hw'])
        for (nme, num, a) in objs:
            if own(f, num) or sheet(a) or a[2] < y - .01 or a[2] >= y + rise: continue
            if ov(fp[0], fp[1], a[0], a[1]) <= TOL or ov(fp[2], fp[3], a[4], a[5]) <= TOL: continue
            ss = [(cx - f['x0']) * f['ux'] + (cz - f['z0']) * f['uz'] for cx in (max(fp[0], a[0]), min(fp[1], a[1])) for cz in (max(fp[2], a[4]), min(fp[3], a[5]))]
            s_lo = max(0.0, min(ss)); under = y - .3 + s_lo * rise / f['L']
            if a[3] > under - .05:
                why.append(f'{nme} stands under it (its top {a[3] - y:.2f} over the floor, the soffit {under - y:.2f} at s {s_lo:.2f})')
        # IN THE HOLE: nothing on the floor above stands in the hole this flight arrives through,
        # floor to FOOT_H (its own rail and head newel excepted). The hole is taken 0.05 in from
        # its edges: a well rail straddles the edge by its own half-thickness (0.03), on the edge
        yt = floors[f['kt']]
        for h in holes:
            if h[0] != f['kt']: continue
            hb = (h[1] + .05, h[3] - .05, h[2] + .05, h[4] - .05)
            for (nme, num, a) in objs:
                if own(f, num) or sheet(a): continue
                if ov(hb[0], hb[1], a[0], a[1]) > TOL and ov(hb[2], hb[3], a[4], a[5]) > TOL and ov(yt + .05, yt + FOOT_H, a[2], a[3]) > TOL:
                    why.append(f'{nme} stands in the hole {h} it arrives through')
        if why: bad.append(f'{name} flight {i} ({f["x0"]}, {f["z0"]}) -> ({f["x1"]}, {f["z1"]}): ' + '; '.join(why))
    rec['feet'] = feet
    for i, ft in enumerate(feet):
        print(f'FEET {name} flight {i}: front {ft["front"]} left {ft["left"]} right {ft["right"]} closed {ft["closed"]}', flush=True)
    if bad:
        raise RuntimeError('THE FOOT RULE (FOOT_CLEAR %.2f m ahead, FOOT_SIDE %.2f m beside an open side) is broken:\n  ' % (FOOT_CLEAR, FOOT_SIDE) + '\n  '.join(bad))


def house_front(z_face, y0, y1, half_door=2.0, door_z=-1.4):
    """A house interior's front lining, either side of the door bay (the door bay lines its
    own middle 4 m), with the short returns that close the door bay's recess step."""
    for xa, xb in ((-5.5, -half_door), (half_door, 5.5)):
        with G.at(M=T((xa + xb) / 2, 0, z_face) @ RY(math.pi)):
            wall(-(xb - xa) / 2, (xb - xa) / 2, y0, y1, 'Lime')
    if half_door <= 0: return              # an upper storey lines the whole front: no step to close
    for s in (-1, 1):
        x = s * half_door
        q = [(x, y0, z_face), (x, y0, door_z), (x, y1, door_z), (x, y1, z_face)]
        # the return faces the ROOM: outward (+-x) when the door bay's face is set back deeper
        # than the lining (a door bay, -1.4 vs -0.8), inward when it stands forward (a shop bay,
        # -0.6). Review 2026-10-06: it faced the wall, culled, a full-height slit of sky
        sg = s if door_z < z_face else -s
        quad(nm('jr'), q, 'Lime', (sg, 0, 0))


def hearth(x, z, y0, yaw=0.0):
    """A hearth standing against the wall line through (x, z) (its frame's +z is the room):
    a basalt firebox, a pale mantel, the ember glow, the chimney breast to the ceiling. (Review
    2026-10-06: two of them were built back to front, through their walls.)"""
    with G.at(M=T(x, y0, z) @ RY(yaw)):
        obox(nm('hb'), -.8, .8, 0, 1.1, 0, .5, 'Basalt', omit=('-y', '-z'))
        obox(nm('hm'), -.95, .95, 1.1, 1.25, 0, .62, 'Pale', omit=('-z',))
        quad(nm('hf'), [(-.5, .1, .51), (.5, .1, .51), (.5, .8, .51), (-.5, .8, .51)], 'S_ember', (0, 0, 1))
        obox(nm('hc'), -.6, .6, 1.25, 2.6, 0, .4, 'Lime', omit=('-y', '-z'))


def bed(x, z, y0, yaw=0.0):
    with G.at(M=T(x, y0, z) @ RY(yaw)):
        box(nm('bf'), -.5, .5, 0, .45, -1.0, 1.0, 'S_oak')
        box(nm('bl'), -.46, .46, .45, .55, -.95, .95, 'S_cloth')
        box(nm('bh'), -.5, .5, 0, 1.0, -1.06, -.96, 'S_oak')


def chair(x, z, y0, yaw=0.0):
    """A chair: seat, back and two board sides (six boxes a chair cost 144 vertices)."""
    with G.at(M=T(x, y0, z) @ RY(yaw)):
        obox(nm('cs'), -.22, .22, .42, .48, -.22, .22, 'S_oak', omit=())
        obox(nm('cb'), -.22, .22, .48, 1.0, -.24, -.18, 'S_oak', omit=('-y',))
        for sx in (-.2, .2):
            obox(nm('cg'), sx - .02, sx + .02, 0, .42, -.2, .2, 'S_oak', omit=('-y', '+y'))


def home_in():
    """A resident's home (3 bays x 9 m; MOONMERE.md section 5 defaults): floor 0 on the
    plinth (1.2), floor 1 (4.8), a stair along the back wall, a hearth, a table, shelves; a
    bed upstairs. Its middle 4 m sits behind the house's door bay."""
    f0, f1, ceil = 1.2, 4.8, 8.15
    slab(-5.5, 5.5, -8.5, -.8, f0, under=None, top='Timber')
    slab(-5.5, 5.5, -8.5, -.8, f1, holes=[(-2.6, -8.4, 1.6, -7.0)])
    quad(nm('ceil'), [(-5.5, ceil, -8.5), (5.5, ceil, -8.5), (5.5, ceil, -.8), (-5.5, ceil, -.8)], 'TimberD', (0, -1, 0))
    lining(-5.5, 5.5, -8.5, -.8, f0, ceil, skip=('n',), windows=[('s', -3.5, 2.6, .8, 1.5), ('s', 3.5, 2.6, .8, 1.5), ('s', -3.5, 5.9, .8, 1.5), ('s', 3.5, 5.9, .8, 1.5)])
    house_front(-.8, f0, f1)
    house_front(-.8, f1, ceil, half_door=0.0)
    st_ = flight_rec(1.5, -7.7, -2.46, -7.7, f0, f1)
    hearth(-5.5, -4.6, f0, yaw=math.pi / 2)
    table(-1.0, -4.0, f0); chair(-1.9, -4.0, f0, math.pi / 2); chair(-.1, -4.0, f0, -math.pi / 2)
    # (1.3 m ahead of the stair's foot, 0.3 off the east lining: FOOT_CLEAR -- at 2.5 it stood 1.0
    # ahead across the flight's wall-side third)
    bookcase(2.8, 5.2, -8.45, f0, h=2.2, yaw=0.0)
    bed(4.2, -5.0, f1); table(3.0, -2.2, f1, w=1.0, d=.6)
    record('home_in', w=12.0, d=9.0, floors=[f0, f1], stairs=[st_], holes=[[1, -2.6, -8.4, 1.6, -7.0]],
           rooms=[[-5.5, -8.5, 5.5, -.8, f0, f1], [-5.5, -8.5, 5.5, -.8, f1, ceil]], frame='house: facade plane z 0, +z the street; middle 4 m behind the door bay')


def open_house(kind):
    """An open house's furnished ground floor (MOONMERE.md MM-4, about six): 'a' a reading
    room (desks, bookcases, a lamp), 'b' a workroom (a long table, drying racks of herbs,
    shelves of jars). Floor 0 on the plinth; ceiling under floor 1."""
    f0, ceil = 1.2, 4.55
    slab(-5.5, 5.5, -8.5, -.8, f0, under=None)
    quad(nm('ceil'), [(-5.5, ceil, -8.5), (5.5, ceil, -8.5), (5.5, ceil, -.8), (-5.5, ceil, -.8)], 'TimberD', (0, -1, 0))
    lining(-5.5, 5.5, -8.5, -.8, f0, ceil, skip=('n',), windows=[('s', -3.5, 2.6, .8, 1.5), ('s', 3.5, 2.6, .8, 1.5)])
    house_front(-.8, f0, ceil)
    for x in (-4.0, 0.0, 4.0):
        box(nm('beam'), x - .1, x + .1, ceil - .25, ceil, -8.5, -.8, 'Timber')
    if kind == 'a':
        bookcase(-5.45, -1.5, -8.45, f0, h=2.6); bookcase(1.5, 5.45, -8.45, f0, h=2.6)
        table(-3.0, -4.5, f0, w=1.8, d=.9); table(3.0, -4.5, f0, w=1.8, d=.9)
        for x in (-3.6, -2.4, 2.4, 3.6): chair(x, -3.8, f0, math.pi)
        box(nm('lamp'), -.1, .1, f0 + .78, f0 + 1.05, -4.6, -4.4, 'S_lit')
    else:
        table(0, -5.0, f0, w=4.5, d=1.0)
        for x in (-3.5, -1.0, 1.5, 4.0):
            # bunches of drying herbs (the leaf picture: with the flowers they read as a planter)
            quad(nm('herb'), [(x - .8, ceil - .9, -6.0), (x + .8, ceil - .9, -6.0), (x + .8, ceil - .3, -6.0), (x - .8, ceil - .3, -6.0)], 'R_leaf', (0, 0, 1))
            quad(nm('herbb'), [(x + .8, ceil - .9, -6.02), (x - .8, ceil - .9, -6.02), (x - .8, ceil - .3, -6.02), (x + .8, ceil - .3, -6.02)], 'R_leaf', (0, 0, -1))
        with G.at(M=T(-5.5, 0, -4.6) @ RY(math.pi / 2)):
            obox(nm('shf'), -1.6, 1.6, f0, f0 + 2.2, 0, .4, 'Timber', omit=('-y', '-z'))
            quad(nm('jars'), [(-1.5, f0 + .1, .41), (1.5, f0 + .1, .41), (1.5, f0 + 2.1, .41), (-1.5, f0 + 2.1, .41)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        hearth(5.5, -4.6, f0, yaw=-math.pi / 2)
    record(f'oh_in_{kind}', w=12.0, d=9.0, floors=[f0], stairs=[], holes=[], rooms=[[-5.5, -8.5, 5.5, -.8, f0, ceil]],
           frame='house: facade plane z 0, +z the street; middle 4 m behind the door bay')


def shop_in():
    """A shop (Quill's, Ada's; MOONMERE.md: at street level): a counter across the room,
    shelves of goods on the back wall, a bench. Its middle 4 m sits behind the shop bay
    (whose door is on the bay's left half)."""
    f0, ceil = 0.0, 4.55
    slab(-5.5, 5.5, -8.5, -.6, f0 + .02, under=None)
    quad(nm('ceil'), [(-5.5, ceil, -8.5), (5.5, ceil, -8.5), (5.5, ceil, -.6), (-5.5, ceil, -.6)], 'TimberD', (0, -1, 0))
    lining(-5.5, 5.5, -8.5, -.6, f0, ceil, skip=('n',))
    house_front(-.8, f0, ceil, door_z=-.6)
    with G.at(M=T(0, 0, -8.45)):
        box(nm('shv'), -4.5, 4.5, 0, 2.8, -.05, .4, 'Timber')
        quad(nm('goods'), [(-4.4, .2, .41), (4.4, .2, .41), (4.4, 2.7, .41), (-4.4, 2.7, .41)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    box(nm('ctr'), -3.0, 3.0, 0, 1.0, -5.2, -4.5, 'S_oak')
    box(nm('ctt'), -3.1, 3.1, 1.0, 1.06, -5.3, -4.4, 'Pale')
    box(nm('scale'), 1.0, 1.4, 1.06, 1.35, -5.0, -4.7, 'S_brass_p')
    record('shop_in', w=12.0, d=9.0, floors=[f0], stairs=[], holes=[], rooms=[[-5.5, -8.5, 5.5, -.6, f0, ceil]],
           frame='house: facade plane z 0, +z the street; middle 4 m behind the shop bay')


def wr_in():
    """A warehouse's loading hall, the net loft and the sail loft (MOONMERE.md: one storey at
    the quay, an inner back wall of sacks and bales at z -5.2 with R1 ramping inside the body
    behind it; the loft over it never walkable).

    It stands behind the DOOR bay of the layout's open warehouses (backs ['load', 'door',
    'load']). Review 2026-10-06: built 11 m wide, the two loading recesses' 5 m side walls
    stood inside it, single-sided. So the hall is the door bay's room, x -2.6..2.6, closed on
    each side by the BACK faces of the neighbouring recesses' walls (x +-2.6, built here; the
    recesses stay the quay's open loading bays), its front lining flush with the door's reveal
    (z -0.45) and pierced by the door's own arch, so no slit opens to the quay."""
    f0, ceil = 0.0, 3.35
    xh, zf, zb = 2.6, -.45, -5.22
    slab(-xh, xh, zb, zf, f0 + .02, under=None)        # 2 cm over the quay: the ground under it never shows through
    quad(nm('ceil'), [(-xh, ceil, zb), (xh, ceil, zb), (xh, ceil, zf), (-xh, ceil, zf)], 'TimberD', (0, -1, 0))
    for x in (-1.3, 0.0, 1.3):
        obox(nm('bm'), x - .1, x + .1, ceil - .22, ceil, zb, zf, 'S_hull', omit=('+y', '-z', '+z'))
    lining(-xh, xh, zb, zf, f0, ceil, skip=('n', 's'), surf='BasaltS')
    with G.at(M=T(0, 0, zb)):
        quad(nm('bales'), [(-xh, 0, 0), (xh, 0, 0), (xh, ceil, 0), (-xh, ceil, 0)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (1.4, 0), (1.4, 1), (0, 1)])
    with G.at(M=T(0, 0, zf) @ RY(math.pi)):
        # the front lining, facing in, cut by the door's arch (wr's door: 1.4 wide, 2.6 + 0.4)
        wall(-xh, xh, f0, ceil, 'BasaltS', [hole(-.7, .7, 0, 2.6, .4, 9)])
    # the loft's trade: crates and kegs, a sail laid out to mend, a net hung to dry
    for x, z in ((-1.9, -4.6), (1.9, -4.6), (-1.9, -3.7)):
        box(nm('crate'), x - .42, x + .42, 0, .8, z - .42, z + .42, 'S_oak')
    box(nm('crate'), -2.25, -1.55, .8, 1.45, -4.95, -4.25, 'S_hull')
    box(nm('sail'), -1.0, 1.4, 0, .3, -3.3, -1.7, 'S_sail')
    for y in (.1, .2):
        box(nm('sailf'), -.9, 1.3, y + .1, y + .14, -3.25, -1.75, 'S_sail')
    with G.at(M=T(xh - .05, 0, -2.6) @ RY(-math.pi / 2)):
        quad(nm('net'), [(-1.4, .25, 0), (1.4, .25, 0), (1.4, 2.8, 0), (-1.4, 2.8, 0)], 'R_net', (0, 0, 1))
        box(nm('netp'), -1.5, 1.5, 2.8, 2.9, -.05, .05, 'S_oak')
    record('wr_in', w=5.2, d=8.5, floors=[f0], stairs=[], holes=[], rooms=[[-xh, -5.2, xh, zf, f0, ceil]],
           walls=[[-xh, -5.5, xh, -5.2, .3], [-xh - .15, -5.2, -xh, zf, .15], [xh, -5.2, xh + .15, zf, .15]],
           frame="house: facade plane z 0, +z the quay; the hall behind the DOOR bay of ['load', 'door', 'load'], x -2.6..2.6")


# ---------------------------------------------------------------- the Long Tower's inside (D-14)
def lt_in():
    """The Long Tower's inside (MOONMERE.md section 2, D-14), built EXACTLY to the contract's
    table in the tower's local frame (yaw pi/2, origin (-61, 178), floor 0 at 0.6 above the
    knoll): local x = -(z - 178), local z = x + 61. A well stair of five straight flights
    (F0-F4) turning a quarter clockwise each floor round the inside walls, one hole a floor
    over the flight that arrives at it, with a rail; floor 1's lobby, the partition with
    its ONE 2.0 m gap pinned to the quest door (-62.6, 180.0), and the annex room the props
    stand in; the observers' gallery on floor 5 under the sealed room (no stair up)."""
    def L(wx, wz): return (-(wz - 178.0), wx + 61.0)
    fl = LT['floors']; inner = 5.2; ceil_top = 21.95
    F = [  # (world strip, foot, top) -> local
        (L(-65.6, 174.0), L(-65.6, 177.96)),
        (L(-65.0, 182.6), L(-61.04, 182.6)),
        (L(-56.4, 182.0), L(-56.4, 178.04)),
        (L(-57.0, 173.4), L(-60.96, 173.4)),
        (L(-65.6, 174.0), L(-65.6, 177.96)),
    ]
    holes_w = [  # floor k (1..5): the strip of the flight arriving at it, 4.2 long
        (-66.2, 173.85, -65.0, 178.05), (-65.15, 182.0, -60.95, 183.2), (-57.0, 177.95, -55.8, 182.15),
        (-61.05, 172.8, -56.85, 174.0), (-66.2, 173.85, -65.0, 178.05)]
    def Lrect(x0, z0, x1, z1):
        a, b = L(x0, z0), L(x1, z1)
        return [min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])]
    holes = [Lrect(*h) for h in holes_w]
    slab(-inner, inner, -inner, inner, fl[0], under=None, top='Pale')
    for k in range(1, 6):
        slab(-inner, inner, -inner, inner, fl[k], holes=[tuple(holes[k - 1])], top='Pale')
        # the well's rail on the hole's open sides -- but never the side the flight arrives
        # through, the edge nearest its head (Philip 2026-10-12: the rail ran straight across the
        # top of every flight; the colliders, moonmere_types.ts wellRails, always left it open)
        x0, z0, x1, z1 = holes[k - 1]
        hx, hz = F[k - 1][1]
        edges = ((x0, z0, x1, z0), (x0, z1, x1, z1), (x0, z0, x0, z1), (x1, z0, x1, z1))
        head = min(edges, key=lambda e: abs(hz - e[1]) if e[1] == e[3] else abs(hx - e[0]))
        for (a, b, c, d) in edges:
            if (a, b, c, d) == head: continue
            if max(abs(a), abs(c)) > inner - .05 and abs(a - c) < 1e-6: continue
            if max(abs(b), abs(d)) > inner - .05 and abs(b - d) < 1e-6: continue
            box(nm('wr'), min(a, c) - .03, max(a, c) + .03, fl[k] + .95, fl[k] + 1.02, min(b, d) - .03, max(b, d) + .03, 'S_oak')
    quad(nm('ceil'), [(-inner, ceil_top, -inner), (inner, ceil_top, -inner), (inner, ceil_top, inner), (-inner, ceil_top, inner)], 'TimberD', (0, -1, 0))
    stairs = []
    for k, ((ax, az), (bx, bz)) in enumerate(F):
        stairs.append(flight_rec(ax, az, bx, bz, fl[k], fl[k + 1]))
    # linings: one continuous wall from floor 0 to the top ceiling, the door on the front
    wins = []
    for f, sill, kind in ((fl[0], 1.8, 'base'), (fl[1], 5.2, 'annex')):
        pass
    for k_, yy in enumerate(fl[2:]):
        for side in ('n', 's', 'e', 'w'):
            for c in (-2.4, 2.4):
                wins.append((side, c, yy + .9, .6, 1.6))
    for c in (-3.3, -1.65, 1.65, 3.3):
        wins.append(('n', c, 5.2, .7, 1.4))           # the annex's window frames, east
    lining(-inner, inner, -inner, inner, fl[0], ceil_top, gaps={'n': [(-.8, .8, fl[0] + 3.0)]}, windows=wins)
    # floor 1: the partition (local z -1.85..-1.35, from x 5.2 to -3.7) with its one gap at
    # the quest door (x -3.0..-1.0), and the annex's north wall on x -3.7
    y0, y1 = fl[1], fl[2] - .25
    door_w = L(-62.6, 180.0)
    gap = (door_w[0] - 1.0, door_w[0] + 1.0)
    for xa, xb in ((-3.7, gap[0]), (gap[1], inner)):
        box(nm('part'), xa, xb, y0, y1, -1.85, -1.35, 'Lime')
    box(nm('lint'), gap[0], gap[1], y0 + 3.15, y1, -1.85, -1.35, 'Lime')
    # A-7: the annex door's own FRAME in the cloister's stone (the quest door built the old
    # city's wall_door.glb section here, a graft of the retired kit, itself retired 2026-10-10 --
    # questDoor places only its leaf and colliders): pale jambs to the leaf's 1.24 m, a
    # banded basalt head, the lintel over it as before
    xm_ = (gap[0] + gap[1]) / 2
    for xa, xb in ((gap[0], xm_ - .64), (xm_ + .64, gap[1])):
        obox(nm('adj'), xa, xb, y0, y0 + 3.0, -1.9, -1.3, 'Pale', omit=('-y',))
    obox(nm('adh'), gap[0] - .05, gap[1] + .05, y0 + 2.92, y0 + 3.15, -1.92, -1.28, 'Basalt')
    box(nm('anw'), -3.85, -3.55, y0, y1, -1.35, inner, 'Lime')
    # the observers' gallery (floor 5): a star chart, a bench, the chart table
    with G.at(M=T(0, fl[5], -inner + .02)):
        quad(nm('chart'), [(-1.8, 1.0, 0), (1.8, 1.0, 0), (1.8, 3.0, 0), (-1.8, 3.0, 0)], 'X_chart', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    table(-1.2, 1.6, fl[5], w=1.4, d=.9)
    # The floors furnished (review 2026-10-06: "the Long Tower floors are bare"), clear of the
    # flights, the wells, the annex and its props (the game's, floor 1) and Merle's spot (2, 1)
    # on floor 5: what an observatory's tower keeps on its way up to a room it may not open.
    def wall_at(side, c, y0):
        # a frame on the inside of wall `side` at position c along it, its +z the room
        return {'n': T(c, y0, inner) @ RY(math.pi), 's': T(c, y0, -inner), 'e': T(inner, y0, c) @ RY(-math.pi / 2),
                'w': T(-inner, y0, c) @ RY(math.pi / 2)}[side]
    f = fl[0]                                               # the lobby off the Provost's loggia
    with G.at(M=wall_at('w', 1.2, f)):
        box(nm('wbench'), -1.2, 1.2, 0, .45, 0, .45, 'S_oak')
    with G.at(M=wall_at('e', -1.6, 0)):
        cabinet(0, 0, f, w=1.6, h=1.9)
    lectern(2.4, 1.8, f, math.pi); rug(-1.6, 1.6, -.8, 2.8, f)
    f = fl[2]                                               # the instrument room
    globe(1.6, -1.2, f)
    table(1.4, 1.8, f, w=1.6, d=.8); chair(.9, 2.5, f, math.pi); chair(1.9, 2.5, f, math.pi)
    for c in (-2.6, .8):
        with G.at(M=wall_at('e', c, 0)): cabinet(0, 0, f, w=1.4, h=1.8)
    bookcase(.4, 4.6, -inner, f, h=2.4)
    f = fl[3]                                               # the star catalogues
    bookcase(-4.6, -.6, -inner, f, h=2.6)
    stack(-1.4, -.6, f, L=3.0, h=2.2)
    table(1.6, -2.4, f, w=1.6, d=.8); chair(1.6, -1.7, f, math.pi)
    with G.at(M=wall_at('w', 1.6, 0)): cabinet(0, 0, f, w=1.4, h=1.8)
    f = fl[4]                                               # the observers' logs, shelved by year
    with G.at(M=wall_at('n', 0, 0)):
        bookcase(-4.6, -.9, 0, f, h=2.6); bookcase(.2, 3.6, 0, f, h=2.6)
    lectern(-2.0, .6, f); table(.8, .9, f, w=1.6, d=.8); chair(.8, .2, f, 0.0)
    f = fl[5]                                               # the observers' gallery under the sealed room
    with G.at(M=wall_at('w', .6, 0)):
        box(nm('wbench'), -1.4, 1.4, f, f + .45, 0, .45, 'S_oak')
    globe(-2.8, -1.8, f, r=.45)
    chair(-1.2, 2.4, f, math.pi)
    rooms = [[-inner, -inner, inner, inner, fl[k], fl[k + 1] if k < 5 else ceil_top] for k in range(6)]
    record('lt_in', w=12.0, d=12.0, floors=fl, stairs=stairs, holes=[[k + 1] + h for k, h in enumerate(holes)], rooms=rooms,
           walls=[[-3.7, -1.85, gap[0], -1.35, .5], [gap[1], -1.85, inner, -1.35, .5], [-3.85, -1.35, -3.55, inner, .3]],
           wallFloor=1,     # (the partition and annex wall stand on floor 1; a record without it, on floor 0)
           doors=[{'x': round(door_w[0], 3), 'z': -1.6, 'yaw': math.pi / 2, 'gap': 2.0, 'for': 'mm_annex_door'}],
           annex=[-3.55, -1.35, inner, inner], lobby=[-4.0, -inner, 0.0, -1.85],
           frame='Long Tower local (yaw pi/2, origin (-61, 178)): x = -(z - 178), z = x + 61; floor 0 = 0.6 above the knoll')


def civic_in(name, hx, hz, floors, ceil, door_side_gap, stairs_spec, holes_spec, wins, furnish, half_floor=None,
             floor0=True, recess=None):
    """A civic interior: slabs, linings with the front door's gap, painted windows, flights
    (each flight's ramp recorded), and the furnishing callback. floor0=False: the shell's own
    deck is the ground floor (the inn). recess: the front door's recess depth -- the floor
    stops where the doorway's top step begins, so the two never z-fight (review 2026-10-06)."""
    ix, iz = hx - .8, hz - .8
    if floor0:
        dh = [(door_side_gap[0], hz - recess, door_side_gap[1], iz)] if recess is not None and hz - recess < iz else []
        slab(-ix, ix, -iz, iz, floors[0], under=None, top='Pale', holes=dh)
    for k in range(1, len(floors)):
        hs = [tuple(h) for h in holes_spec if h[0] == k]
        # civic upper floors are flagged (the pale stone's 2 m tile: half the timber's slicing)
        if half_floor and k == half_floor[0]:
            slab(-ix, ix, half_floor[1], half_floor[2], floors[k], holes=[h[1:] for h in hs], top='Pale')
        else:
            slab(-ix, ix, -iz, iz, floors[k], holes=[h[1:] for h in hs], top='Pale')
    quad(nm('ceil'), [(-ix, ceil, -iz), (ix, ceil, -iz), (ix, ceil, iz), (-ix, ceil, iz)], 'TimberD', (0, -1, 0))
    lining(-ix, ix, -iz, iz, floors[0], ceil, gaps={'n': [door_side_gap]}, windows=wins)
    st_ = [flight_rec(*s) for s in stairs_spec]
    furnish(ix, iz)
    record(name, w=2 * hx, d=2 * hz, floors=floors, stairs=st_, holes=[list(h) for h in holes_spec],
           rooms=[[-ix, -iz, ix, iz, floors[k], floors[k + 1] if k + 1 < len(floors) else ceil] for k in range(len(floors))],
           frame='civic: origin the footprint centre on its ground, +z the front (its door)')


def ar_in():
    """The Returns Archive's inside: the returns desk on floor 0 (Junn behind it, MOONMERE.md
    section 3), the lower shelf (the two-moon stack) and DIRECTLY OVER IT on floor 1 the
    moon stack, joined by a real stair; the top room over the east half on floor 2. Review
    2026-10-06 ("a few loose tables"): rows of free-standing stacks either side of the reading
    tables, the returns' card cabinets by the desk, lecterns, a rug, the clerks' room above."""
    fl = [.6, 4.2, 7.8]
    def furnish(ix, iz):
        box(nm('desk'), -1.8, 1.8, fl[0], fl[0] + 1.05, 4.6, 5.4, 'S_oak')
        box(nm('dtop'), -1.9, 1.9, fl[0] + 1.05, fl[0] + 1.12, 4.5, 5.5, 'Pale')
        for x in (-2.4, 2.4):
            cabinet(x, 2.4, fl[0], w=1.6, h=1.6)          # the returns' card index, behind Junn
        rug(-2.2, 2.2, 1.6, 4.2, fl[0])
        for f in fl[:2]:
            # the wall cases behind the two-moon / moon stacks (the stacks themselves are the game's
            # return_shelf props at the spot (-6, -4.5), one over the other, zones.json). Each starts
            # 0.64 m past F0's top tread (x -6.04): at -6.0 the floor-1 case met F0's head 0.04 m on,
            # across the wall-side 0.3 m of its width (the stair-foot review, 2026-10-09)
            bookcase(-5.4, -3.9, -iz, f, h=2.8)
            bookcase(4.0, 6.0, -iz, f, h=2.8)
            # (the end-wall cases stop 0.65 short of the back wall: FOOT_SIDE beside each flight's foot,
            # which comes off them on its open side -- RY(-pi/2) takes local x to z, RY(+pi/2) to -z)
            with G.at(M=T(ix, 0, 0) @ RY(-math.pi / 2)):
                bookcase(-4.25, -.5, 0, f, h=2.8); bookcase(.5, 4.5, 0, f, h=2.8)
            with G.at(M=T(-ix, 0, 0) @ RY(math.pi / 2)):
                bookcase(-4.5, 4.25, 0, f, h=2.8)
            # the rows: free-standing double-sided stacks across the hall's two wings
            for x in (-8.4, -6.2, 6.2, 8.4):
                stack(x, -.4, f, L=3.4, h=2.4, yaw=math.pi / 2)
        table(-3.0, 0.5, fl[0], w=2.4, d=1.0); table(3.0, 0.5, fl[0], w=2.4, d=1.0)
        for x in (-3.8, -2.2, 2.2, 3.8):
            chair(x, -.3, fl[0], 0.0); chair(x, 1.3, fl[0], math.pi)
        lectern(-4.6, 3.2, fl[0], math.pi); lectern(4.6, 3.2, fl[0], math.pi)
        table(0, -2.0, fl[1], w=3.0, d=1.0)
        for x in (-1.0, 1.0): chair(x, -2.8, fl[1], 0.0)
        lectern(0, 1.6, fl[1])
        # floor 2, the clerks' room over the east half (z < 0)
        table(4.5, -3.6, fl[2], w=1.8, d=.9); chair(4.5, -2.8, fl[2], math.pi)
        bookcase(2.0, 5.2, -iz, fl[2], h=2.4); cabinet(-3.0, -iz, fl[2])     # (0.84 m short of F1's head, x 6.04)
        lectern(2.5, -1.2, fl[2])
        # the top room's partition at z 0, both faces; a window from it over the hall (floor 2 is
        # the east half only: a doorway there opened onto a 3.6 m drop)
        Hw = hole(-6.4, -5.2, fl[2] + .9, fl[2] + 2.3, 0, 1)
        with G.at(M=RY(math.pi)):
            wall(-ix, ix, fl[2], 11.1, 'Lime', [Hw])
        wall(-ix, ix, fl[2], 11.1, 'LimeS', [dict(Hw, a=5.2, b=6.4, top=[(5.2, Hw['ys']), (6.4, Hw['ys'])])])
    wins = []
    for side, xs in (('n', (-10, -6, 6, 10)), ('s', (-10, -6, -2, 2, 6, 10)), ('e', (-4.7, 0, 4.7)), ('w', (-4.7, 0, 4.7))):
        for x in xs:
            wins.append((side, x, 2.0, 1.2, 1.9))
            if side != 'n': wins.append((side, x, 8.2, 1.0, 1.9))
    civic_in('ar_in', 12.0, 7.0, fl, 11.1, (-1.0, 1.0, fl[0] + 3.4),
             # (each foot 1.2 m off its end lining, FOOT_CLEAR -- 0.8 before the stair-foot pass; each flight
             # and its hole slid 0.4 up the run, hole 1 flush with F0's top tread as mc_in's are, so the
             # moon stack keeps its spot. Hole 1's room-side edge is z -4.88, 0.02 off F0's edge: at -4.8
             # the Moon Stack's shelf (x -6.85..-5.15, z -4.88..-4.12 on floor 1) stood 0.08 m out over
             # the well -- moonmere_stair_feet.test.mjs holds the game's props out of every hole)
             [(-10.0, -5.5, -6.04, -5.5, fl[0], fl[1]), (10.0, -5.5, 6.04, -5.5, fl[1], fl[2])],
             [(1, -10.2, -6.2, -6.04, -4.88), (2, 5.9, -6.2, 10.2, -4.8)], wins, furnish, half_floor=(2, -6.2, 0.0), recess=1.0)


def lodge_in():
    """A lodge's inside: the stamp desk on floor 0 by the door, the stair, floor 1 (Avery
    Quarles at the Registry). Furnished as a working office (review 2026-10-06: bare): the
    pigeonholes and the cabinets of the rolls, a bench for those waiting, the clerk's lectern,
    a hearth; upstairs the registrar's table, the rolls' presses, a rug."""
    fl = [.6, 4.2]
    def furnish(ix, iz):
        box(nm('desk'), -1.5, 1.5, fl[0], fl[0] + 1.0, 2.4, 3.1, 'S_oak')
        box(nm('dtop'), -1.6, 1.6, fl[0] + 1.0, fl[0] + 1.07, 2.3, 3.2, 'Pale')
        bookcase(-4.9, -1.0, -iz, fl[0], h=2.6)
        with G.at(M=T(-ix, 0, -2.7) @ RY(math.pi / 2)):
            cabinet(0, 0, fl[0], w=1.2, h=1.9)
        with G.at(M=T(-ix, 0, 0) @ RY(math.pi / 2)):
            box(nm('wbench'), -1.8, 1.8, fl[0], fl[0] + .45, 0, .45, 'S_oak')
        lectern(-2.2, .4, fl[0], math.pi)
        chair(0, 1.6, fl[0], 0.0)
        rug(-1.6, 1.6, -1.2, 1.2, fl[0])
        hearth(ix, 0.5, fl[0], yaw=-math.pi / 2)
        table(2.5, -1.5, fl[1], w=1.6, d=.8); chair(2.5, -.8, fl[1], math.pi)
        bookcase(-4.9, -1.0, -iz, fl[1], h=2.4)
        with G.at(M=T(ix, 0, 0) @ RY(-math.pi / 2)):
            bookcase(-2.6, .6, 0, fl[1], h=2.2)
        cabinet(-2.5, iz, fl[1], w=1.4, h=1.6, yaw=math.pi)
        rug(-3.0, .4, -1.8, 1.4, fl[1])
    wins = [(s, x, 2.0, 1.0, 1.9) for s, xs in (('n', (-3.6, 3.6)), ('s', (-3.6, -1.6, 1.6, 3.6)), ('e', (-3, 0, 3)), ('w', (-3, 0, 3))) for x in xs]
    civic_in('lodge_in', 6.0, 5.5, fl, 7.55, (-.8, .8, fl[0] + 2.9),
             # (the foot 1.2 m off the east lining, FOOT_CLEAR -- Philip 2026-10-09: it stood 0.6 off, the
             # flight entered only by a 0.6 m slot down that wall; flight and hole slid 0.6 up the run)
             [(4.0, -4.1, .04, -4.1, fl[0], fl[1])], [(1, -.1, -4.7, 4.15, -3.5)], wins, furnish, recess=.9)


def ch_in():
    """The Customs House hall (MOONMERE.md: it ends at an inner wall 5.5 m behind its facade;
    its loggia is outside): ledger desks, a weighing beam, crates, the tax chest."""
    f0, ceil = 0.02, 3.35; zf = 2.5; zb = zf - 5.5
    slab(-9.2, 9.2, zb, zf - .8, f0, under=None, top='Pale')
    quad(nm('ceil'), [(-9.2, ceil, zb), (9.2, ceil, zb), (9.2, ceil, zf - .8), (-9.2, ceil, zf - .8)], 'TimberD', (0, -1, 0))
    lining(-9.2, 9.2, zb, zf - .8, 0, ceil, gaps={'n': [(-1.2, 1.2, 3.0), (-9.1, -6.9, 2.5), (-5.1, -2.9, 2.5), (2.9, 5.1, 2.5), (6.9, 9.1, 2.5)]})
    with G.at(M=T(0, 0, zb)):
        quad(nm('bales'), [(-9.2, 0, .01), (9.2, 0, .01), (9.2, ceil, .01), (-9.2, ceil, .01)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (4, 0), (4, 1), (0, 1)])
    for x in (-6.0, 6.0):
        table(x, -1.0, 0, w=2.2, d=.9)
        box(nm('ledger'), x - .3, x + .3, .8, .86, -1.2, -.8, 'S_cloth')
    box(nm('beam'), -.05, .05, 0, 2.4, -1.5, -1.4, 'S_oak')
    box(nm('bar'), -1.2, 1.2, 2.3, 2.38, -1.5, -1.4, 'S_brass_p')
    for x in (-8.0, -3.5, 3.5, 8.0):
        box(nm('crate'), x - .5, x + .5, 0, .9, zb + .2, zb + 1.2, 'S_oak')
    box(nm('chest'), -.6, .6, 0, .7, zb + .2, zb + .9, 'S_hull')
    record('ch_in', w=20.0, d=12.0, floors=[f0], stairs=[], holes=[], rooms=[[-9.2, zb, 9.2, zf - .8, f0, ceil]],
           frame='civic: origin the footprint centre at quay level, +z the mere; the hall ends at z -3.0')


def mc_in():
    """The Mending College's front range inside (the infirmary hall, MOONMERE.md section 3):
    beds behind cloth screens, the dean's desk, the herb presses along the back wall, the
    trainer's place; floor 1 the second ward; floor 2 the college's library; the door
    through to the cloister court. The spots (Warden Liss, Proctor Elm, Dean Fairlie on
    floor 0 at z 10.5, the mending bench and register props, Linden Crewe on floor 1) are
    kept clear: the props are the game's."""
    fl = [.6, 4.2, 7.8]; ceil = 11.1
    x0, x1, z0, z1 = -15.2, 15.2, 6.8, 13.2
    slab(x0, x1, z0, z1, fl[0], under=None, top='Pale', holes=[(-1.0, 13.0, 1.0, 13.2)])     # the portal's top step is the floor there
    for k in (1, 2):
        slab(x0, x1, z0, z1, fl[k], holes=[(14.0, 8.04, 15.2, 12.0)] if k == 1 else [(-15.2, 8.04, -14.0, 12.0)], top='Pale')
    quad(nm('ceil'), [(x0, ceil, z0), (x1, ceil, z0), (x1, ceil, z1), (x0, ceil, z1)], 'TimberD', (0, -1, 0))
    wins = [('n', x, 2.0, 1.1, 2.0) for x in (-14, -10, -6, 6, 10, 14)] + [('n', x, 8.2, 1.0, 1.8) for x in (-14, -10, -6, -2, 2, 6, 10, 14)] + \
           [('s', x, 5.3, .85, 1.8) for x in (-6, -2, 2, 6)]
    lining(x0, x1, z0, z1, fl[0], ceil, gaps={'n': [(-1.0, 1.0, fl[0] + 3.4)], 's': [(-1.0, 1.0, fl[0] + 2.6)]}, windows=wins)
    # S2 (LOOKED in the hall, walked): each flight ran across the range (z 11.0 -> 7.04) under a
    # 4.2 x 1.2 hole laid ALONG it (x 11..15.2, z 6.8..8.0) -- it climbed into the floor above's
    # boards and topped out against the back wall. Each still climbs against its end wall toward
    # the back (z 12.0 -> 8.04), now under its own strip's hole (x 14.0..15.2, z 8.04..12.0):
    # its foot is met along the front wall, 1.2 m off it (FOOT_CLEAR; 1.15 before the stair-foot
    # pass), its head arrives forward on the back wall's strip of the floor above (z 6.8..8.04),
    # the hole's long side railed
    st_ = [flight_rec(14.6, 12.0, 14.6, 8.04, fl[0], fl[1]), flight_rec(-14.6, 12.0, -14.6, 8.04, fl[1], fl[2])]

    def screen(x, za, zb, y0):
        """A cloth screen on a timber frame between two beds."""
        box(nm('scf'), x - .03, x + .03, y0, y0 + 1.9, za, za + .06, 'S_oak'); box(nm('scf'), x - .03, x + .03, y0, y0 + 1.9, zb - .06, zb, 'S_oak')
        for sg in (1, -1):
            q = [(x + .015 * sg, y0 + .3, za + .06), (x + .015 * sg, y0 + .3, zb - .06), (x + .015 * sg, y0 + 1.8, zb - .06), (x + .015 * sg, y0 + 1.8, za + .06)]
            quad(nm('scc'), q, 'S_cloth', (sg, 0, 0))
    # (S2: floor 0's east end keeps one bed and no screen: the front wall's strip there is the way
    # to flight 1's foot)
    for f, beds in ((fl[0], (-12.5, -9.5, 9.5)), (fl[1], (-10.0, -4.0, 4.0, 10.0))):
        for x in beds:
            bed(x, 11.6, f)
            box(nm('bst'), x + .65, x + 1.1, f, f + .6, 12.0, 12.5, 'S_oak')          # a bedside stand
        for x in ((-11.0,) if f == fl[0] else (-7.0, 7.0)):
            screen(x, 10.4, 12.9, f)
        # (S2: floor 1's west press stood across flight 2's arrival strip)
        for x in (-10.0, -8.2, 8.2, 10.0) if f == fl[0] else (-9.0, -1.0, 1.0):
            cabinet(x, z0, f, w=1.4, h=1.9)                    # the herb and linen presses on the back wall
    # floor 0: a bench for those waiting (the mending bench itself is the game's prop at (3, 9)),
    # the dean's desk, the register press
    box(nm('bench'), -2.2, .2, fl[0], fl[0] + .46, 8.6, 9.0, 'S_oak')
    box(nm('bench'), -5.7, -3.3, fl[0], fl[0] + .46, 9.0, 9.4, 'S_oak')
    box(nm('desk'), -7.2, -4.8, fl[0], fl[0] + .8, 7.7, 8.5, 'S_oak'); chair(-6.0, 7.3, fl[0], 0.0)
    box(nm('reg'), 3.4, 4.6, fl[0], fl[0] + 1.1, 7.6, 8.2, 'S_oak')
    rug(-1.6, 1.6, 11.0, 12.8, fl[0])
    # floor 1: the ward's table of remedies
    table(0, 8.2, fl[1], w=1.8, d=.8)
    for x in (-.5, .5):
        lathe(nm('jar'), [(0, .78, False), (.1, .8, True), (.1, 1.0, True), (.06, 1.06, True), (0, 1.06, False)], 'S_water', seg=8, cx=x, cy=fl[1], cz=8.2)
    # floor 2: the college's library -- presses of books on the back and front walls, reading tables
    for xa, xb in ((-10.5, -6.5), (-5.5, -1.5), (1.5, 5.5), (6.5, 10.5)):
        bookcase(xa, xb, z0, fl[2], h=2.6)
    for xa, xb in ((-13.5, -9.5), (9.5, 13.5)):
        bookcase(xa, xb, z1, fl[2], h=2.4, yaw=math.pi)
    for x in (-4.0, 4.0):
        table(x, 10.2, fl[2], w=2.4, d=1.0)
        for dx in (-.7, .7): chair(x + dx, 9.4, fl[2], 0.0)
    lectern(0, 10.6, fl[2]); globe(-8.0, 10.4, fl[2])
    # S2 REVIEW (LOOKED in the ward and on floor 1: bare plaster boxes -- box beds, one rug, no
    # lamp, nothing on the walls -- below the bar the facades set). Dressed by room, varied bay
    # to bay, every spot and the stair strips kept clear:
    blankets = ('S_blue', 'S_sail', 'S_red', 'S_cloth', 'S_shutgreen')
    for f, beds in ((fl[0], (-12.5, -9.5, 9.5)), (fl[1], (-10.0, -4.0, 4.0, 10.0))):
        for i, x in enumerate(beds):
            # each bed's blanket its own colour, turned down over the foot (the linen stays at the head)
            b_ = blankets[(i * 3 + (2 if f > 1 else 0)) % len(blankets)]
            obox(nm('blk'), x - .48, x + .48, f + .55, f + .6, 11.0, 12.58, b_)
            obox(nm('pil'), x - .3, x + .3, f + .55, f + .66, 10.66, 10.98, 'S_pale_s')
        # wall lamps between the front windows, one a bay pair (lit at night: the lit swatch)
        for x in (-12.0, -8.0, 8.0, 12.0):
            obox(nm('scb'), x - .05, x + .05, f + 2.0, f + 2.12, z1 - .26, z1, 'S_iron', omit=('+z',))
            obox(nm('scl'), x - .09, x + .09, f + 2.12, f + 2.42, z1 - .3, z1 - .12, 'S_lit', omit=())
    # the apothecary shelves on the back wall (floor 0 east of the presses, floor 1 its east end):
    # three boards of jars and bottles, herb bundles hung from the top board
    jar_cols = ('S_water', 'S_cotta', 'S_glass_s', 'S_pale_s', 'S_blue')
    for f, xa, xb in ((fl[0], 11.6, 13.6), (fl[0], -15.0, -13.0), (fl[1], 4.4, 6.6)):          # (floor 1's east end is flight 1's arrival strip)
        obox(nm('shf'), xa, xb, f, f + 2.1, z0, z0 + .36, 'S_oak', omit=('-y', '-z'))
        for k, y in enumerate((.55, 1.15, 1.75)):
            obox(nm('shb'), xa + .04, xb - .04, f + y - .04, f + y, z0, z0 + .34, 'S_oak', omit=('-z', '-x', '+x'))
            for j in range(int((xb - xa) / .34)):
                if (j * 7 + k * 3) % 5 == 4: continue          # a gap where a jar is in use
                # (a jar a box with its back and foot left off: 6 triangles -- turned jars were 60 each, MEASURED)
                cx_ = xa + .2 + j * .34; h_ = .16 + .08 * ((j + k) % 3); r_ = .07 + .02 * ((j * 2 + k) % 2)
                obox(nm('jr'), cx_ - r_, cx_ + r_, f + y, f + y + h_, z0 + .18 - r_, z0 + .18 + r_, jar_cols[(j + 2 * k) % len(jar_cols)], omit=('-y', '-z'))
        for j in range(3):
            hx_ = xa + .35 + j * (xb - xa - .7) / 2
            obox(nm('hbd'), hx_ - .08, hx_ + .08, f + 1.5, f + 1.86, z0 + .3, z0 + .46, 'S_leafg' if j % 2 else 'S_moss', omit=('+y', '-z'))
    # herb bundles drying from the ward's beams, along its back half (clear of the flights)
    # (hung on a line under the beam: the bundle's top against it, no cord drawn)
    for x in (-12.0, -10.4, -8.8, -5.2, 5.6, 7.2, 10.8):
        y_ = fl[1] - .25
        obox(nm('hrb'), x - .09, x + .09, y_ - .5, y_, 8.93, 9.09, ('S_leafg', 'S_moss', 'S_leafd')[int(abs(x)) % 3], omit=('+y',))
    # the college's charter over the court door
    with G.at(z=z0 + .01):
        plaque(0, fl[0] + 3.35, .8)
    # the dean's lectern by the desk; a washstand and a basin in the second ward
    lectern(-3.9, 7.75, fl[0], 0.0)
    box(nm('wst'), -13.6, -12.6, fl[1], fl[1] + .8, z0, z0 + .5, 'S_oak')
    obox(nm('bas'), -13.42, -12.78, fl[1] + .8, fl[1] + .95, z0 + .06, z0 + .44, 'S_pale_s')
    rug(-11.0, -6.0, 9.2, 10.4, fl[1])
    record('mc_in', w=32.0, d=28.0, floors=fl, stairs=st_, holes=[[1, 14.0, 8.04, 15.2, 12.0], [2, -15.2, 8.04, -14.0, 12.0]],
           rooms=[[x0, z0, x1, z1, fl[k], fl[k + 1] if k < 2 else ceil] for k in range(3)],
           frame='civic: origin the footprint centre, +z the front (the East Terrace); the front range z 6.8..13.2')


def inn_in():
    """The Shelf Inn's inside: the bar with its kegs, tables and benches by the fire, the
    stair, the rooms upstairs (floors 1.6 and 5.2 absolute = 0.6 and 4.2 here). Its ground
    floor IS the shell's deck (review 2026-10-06: the two floors at 0.6 z-fought); Rue's spot
    (3.2, 2.3) stays clear."""
    fl = [.6, 4.2]
    def furnish(ix, iz):
        box(nm('bar'), -6.6, -2.0, fl[0], fl[0] + 1.1, -2.6, -2.0, 'S_oak')
        box(nm('bart'), -6.7, -1.9, fl[0] + 1.1, fl[0] + 1.16, -2.7, -1.9, 'Pale')
        with G.at(M=T(-4.3, 0, -iz)):
            obox(nm('shv'), -2.3, 2.3, fl[0], fl[0] + 2.4, 0, .35, 'Timber', omit=('-y', '-z'))
            quad(nm('bottles'), [(-2.2, fl[0] + .2, .36), (2.2, fl[0] + .2, .36), (2.2, fl[0] + 2.3, .36), (-2.2, fl[0] + 2.3, .36)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        for z in (-3.3, -4.2):
            lathe(nm('keg'), [(.3, 0, True), (.36, .35, True), (.3, .7, True), (0, .7, False)], 'S_oak', seg=8, cx=-6.7, cy=fl[0] + .02, cz=z)
            lathe(nm('kegb'), [(.34, .14, True), (.34, .2, True)], 'S_iron', seg=8, cx=-6.7, cy=fl[0] + .02, cz=z, caps=False)
        hearth(ix, -1.0, fl[0], yaw=-math.pi / 2)
        rug(4.9, 6.6, -2.2, .2, fl[0])
        chair(5.2, -1.8, fl[0], -math.pi / 2); chair(5.2, -.2, fl[0], -math.pi / 2)
        for (x, z) in ((1.5, 2.2), (4.5, 2.2), (2.5, -1.5)):
            table(x, z, fl[0], w=1.4, d=.9)
            box(nm('bench'), x - .7, x + .7, fl[0], fl[0] + .45, z - .9, z - .6, 'S_oak')
            box(nm('bench'), x - .7, x + .7, fl[0], fl[0] + .45, z + .6, z + .9, 'S_oak')
        # upstairs: three rooms behind board partitions, a bed, a chest and a stool each
        for x in (-2.25, 2.25):
            obox(nm('part'), x - .05, x + .05, fl[1], fl[1] + 2.5, -iz, -1.6, 'S_oak', omit=('-y',))
        for x in (-4.5, 0.0, 4.5):
            bed(x, -4.0, fl[1])
            box(nm('chest'), x - .5, x + .5, fl[1], fl[1] + .5, -2.75, -2.3, 'S_hull')
            box(nm('stool'), x + .7, x + 1.05, fl[1], fl[1] + .45, -2.4, -2.05, 'S_oak')
        table(-4.0, 1.6, fl[1], w=1.2, d=.8); chair(-4.0, 2.3, fl[1], math.pi)
    wins = [(s, x, 1.6, 1.0, 1.9) for s, xs in (('n', (-6, -2.1, 2.1, 6)), ('s', (-6, -2, 2, 6)), ('e', (-4, 0, 4)), ('w', (-4, 0, 4))) for x in xs if not (s == 'n' and abs(x) < 2)]
    civic_in('inn_in', 8.0, 6.0, fl, 7.55, (-.75, .75, fl[0] + 2.7),
             # (the foot 1.2 m off the front lining, FOOT_CLEAR -- 0.8 before the stair-foot pass; the head
             # still 0.09 clear of the hearth's mantel at z -0.05)
             [(6.6, 4.0, 6.6, .04, fl[0], fl[1])], [(1, 6.0, -.1, 7.2, 4.2)], wins, furnish, floor0=False)


SURF_TINT = {'TufaB': .9, 'TufaC': .26}


def srgb(v):
    """Blender's linear -> sRGB: a BYTE_COLOR attribute's .color is linear and is STORED (and so
    shipped, and multiplied at runtime) as sRGB -- a 0.5 tint multiplies by 0.735 (MEASURED in the
    burn's first look: the floor's blots at a quarter of their strength)"""
    return 12.92 * v if v <= .0031308 else 1.055 * v ** (1 / 2.4) - .055


def lin(e):
    """the linear tint that ships as the effective multiplier e"""
    return e / 12.92 if e <= .04045 else ((e + .055) / 1.055) ** 2.4
SOOTS = ('X_scorch', 'X_scorch_b', 'X_scorch_c')


def soot_panel(q, nn, rng, tint=1.0, surfs=SOOTS):
    """One soot panel: the quad q (its first two corners at the foot, the last two over them) laid
    with one of the soot swatches, mirrored or not, seeded (S3 review, A-13: every panel had taken
    the one three-lick swatch whole, so the same shape stood in a row). tint: the wall's own over
    the swatch ground's (the burned tufa, TufaB), so the panel's edge is the wall's colour."""
    a = 1.0 if rng.random() < .5 else 0.0
    uv = [(a, 0.0), (1 - a, 0.0), (1 - a, 1.0), (a, 1.0)]
    mesh(nm('soot'), q, [(0, 1, 2, 3)], surfs[rng.randrange(len(surfs))], facing=nn, uvs=[uv], tint=tint)


def burned_floor(ix, iz, f0, hole=None, step=.75):
    """The Burned Shelf's floor (S3 review, A-13, high: its scorch marks were the soot swatch -- on
    the burned TUFA's ground -- stamped on the PALE flags, a light rectangle with straight edges
    round every blot). Now there are no marks to have edges: the floor is the Pale flags laid as a
    0.75 m grid and the burn is in its VERTEX tint (the instancer multiplies the vertex colour, as it
    does the baked occlusion), a field of soft blots -- heaviest under the open roof, where the
    rafters came down and round the burned cases -- each with a ragged edge (a seeded lattice
    noise), fading into the flags with no line anywhere."""
    import random as _r
    rng = _r.Random(917)
    NS = 1.2
    lat = {(i, j): rng.random() for i in range(-12, 13) for j in range(-8, 9)}
    def noise(x, z):
        gx, gz = x / NS, z / NS
        i, j = math.floor(gx), math.floor(gz); fx, fz = gx - i, gz - j
        fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
        g = lambda a, b: lat.get((a, b), .5)
        return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fz) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fz
    # (x, z, radius, strength): where the ridge fell and the heap lies, round the burned cases, under
    # the break, a few lighter ones into the roofed half
    blobs = [(-9.0, 1.2, 2.8, .9), (-6.4, -1.4, 2.3, .75), (-3.6, 4.3, 2.0, .7), (-2.6, -3.5, 1.9, .65), (-7.8, 4.7, 1.7, .6),
             (-9.3, -4.8, 2.0, .7), (-4.9, -5.3, 1.6, .55), (-5.3, 1.6, 1.4, .5), (.4, 1.2, 1.7, .5), (.9, -4.6, 1.3, .4),
             (2.8, -3.7, 1.4, .4), (7.7, 3.7, 1.3, .3), (4.6, 2.2, 1.0, .22)]
    def burn(x, z):
        d = .42 * min(1.0, max(0.0, (1.5 - x) / 4.5))           # the open half, smoke-dark all over
        for bx, bz, r, k in blobs:
            r, k = r * 1.2, k * 1.25
            q = ((x - bx) ** 2 + (z - bz) ** 2) / (r * r)
            d += k * math.exp(-2.2 * q)
        d *= .55 + .9 * noise(x + 31.0, z - 17.0)
        return max(.13, 1.0 - min(.87, d))
    xs = sorted({round(-ix + k * step, 4) for k in range(int(2 * ix / step) + 1)} | {ix} | ({hole[0], hole[2]} if hole else set()))
    zs = sorted({round(-iz + k * step, 4) for k in range(int(2 * iz / step) + 1)} | {iz} | ({hole[1]} if hole else set()))
    xs = [x for x in xs if -ix - 1e-6 <= x <= ix + 1e-6]; zs = [z for z in zs if -iz - 1e-6 <= z <= iz + 1e-6]
    vs, fs = [], []
    idx = {}
    for i, x in enumerate(xs):
        for j, z in enumerate(zs):
            idx[i, j] = len(vs); vs.append((x, f0, z))
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            mx, mz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            if hole and hole[0] < mx < hole[2] and hole[1] < mz < hole[3]: continue
            fs.append((idx[i, j], idx[i, j + 1], idx[i + 1, j + 1], idx[i + 1, j]))
    o = mesh(nm('fl'), vs, fs, 'Pale', facing=(0, 1, 0))
    ti = o.data.color_attributes['Tint']
    for k, v in enumerate(o.data.vertices):
        gx, gy, gz = v.co.x, v.co.z, -v.co.y
        # (the burn is the EFFECTIVE multiplier: written through color_srgb, as the attribute is stored)
        t = burn(gx, gz) * ti.data[k].color_srgb[0]
        # (grey: the module test holds every vertex colour grey, a white base the tints multiply)
        ti.data[k].color_srgb = (t, t, t, 1)


def bs_in():
    """The Burned Shelf's inside (MOONMERE.md section 3: "the room where the academy burned
    its astronomy section, deliberately, indoors"): a scorched floor, rows of iron shelving
    warped by the heat with the burned books still on them, fallen beams; open to the sky
    over the north half. Ruling 11: never neat. Review 2026-10-06: its walls were clean white
    lime, so it did not read as a room that burned -- they are smoke-dark tufa now, soot
    climbing them in tongues over the shelves and the windows, the ceiling of the surviving
    half charred at its broken edge; the floor's scorch marks no longer overlap (they
    z-fought); the shelving keeps clear of the spots (Corvo (2, 3), Thrale (-4.5, 2)) and of
    the game's bench and book props at (6, -3) and (-6, -3)."""
    hx, hz = 11.0, 7.0; ix, iz = hx - .8, hz - .8; f0 = .6
    rng = __import__('random').Random(911)
    burned_floor(ix, iz, f0, hole=(-.9, hz - .9, .9, iz))
    # linings: smoke-blackened tufa (TufaC; S3 review A-13: TufaS read as clean gold masonry); the
    # roofed (south, +x) half to the eave, the burned half to the 6.6 band (the shell's own broken
    # inner face rises over it)
    lining(0, ix, -iz, iz, f0, 8.7, skip=('w',), surf='TufaC', gaps={'n': [(0.0, .9, f0 + 3.2)]})
    lining(-ix, 0, -iz, iz, f0, 6.6, skip=('e',), surf='TufaC', gaps={'n': [(-.9, 0.0, f0 + 3.2)]})
    # soot in tongues up the walls (the burned half heavier), each its own panel of the wall -- each
    # one of three soot shapes, mirrored or not, seeded (A-13: one swatch stamped down every wall),
    # and tinted to the lining's TufaC so its ground is the wall's colour
    srng = __import__('random').Random(913)
    for side, xs, top in (('s', (-8.5, -5.0, -1.6, 3.0), 6.4), ('n', (-8.0, -4.2, 4.0), 6.4), ('w', (-3.0, 2.8), 6.3)):
        for c in xs:
            h_ = top - (rng.uniform(.4, 1.6) if c > 0 and side != 'w' else rng.uniform(0, .5))
            w_ = rng.uniform(1.1, 1.6)
            if side == 's':
                q = [(c + w_, f0 + .4, -iz + .012), (c - w_, f0 + .4, -iz + .012), (c - w_, h_, -iz + .012), (c + w_, h_, -iz + .012)]; nn = (0, 0, 1)
            elif side == 'n':
                q = [(c - w_, f0 + 3.4, iz - .012), (c + w_, f0 + 3.4, iz - .012), (c + w_, h_, iz - .012), (c - w_, h_, iz - .012)]; nn = (0, 0, -1)
            else:
                q = [(-ix + .012, f0 + .4, c - w_), (-ix + .012, f0 + .4, c + w_), (-ix + .012, h_, c + w_), (-ix + .012, h_, c - w_)]; nn = (1, 0, 0)
            # (the panel's ground is the sheet's tufa x 0.9; the wall ships as tufa x srgb(TufaC))
            soot_panel(q, nn, srng, tint=lin(srgb(SURF_TINT['TufaC']) / .9))
    quad(nm('ceil'), [(0, 8.7, -iz), (ix, 8.7, -iz), (ix, 8.7, iz), (0, 8.7, iz)], 'TimberD', (0, -1, 0))
    quad(nm('ceilc'), [(.02, 8.69, -iz), (2.6, 8.69, -iz), (2.6, 8.69, iz), (.02, 8.69, iz)], 'S_char', (0, -1, 0))
    for x in (2.0, 5.0, 8.0):
        obox(nm('bm'), x - .12, x + .12, 8.4, 8.7, -iz, iz, 'S_char' if x < 3 else 'Timber', omit=('+y', '-z', '+z'))
    for (x, z) in ((-8.3, -3.0), (-7.6, 3.4), (-2.6, -3.3), (-2.4, 3.6), (2.6, -3.3), (7.8, 3.4)):
        burned = x < 0
        tilt = rng.uniform(.08, .22) * (1 if rng.random() < .5 else -1) if burned else rng.uniform(-.03, .03)
        with G.at(M=T(x, f0, z) @ Matrix.Rotation(tilt, 4, 'Z') @ Matrix.Rotation(rng.uniform(-.1, .1) if burned else 0, 4, 'X')):
            for xs in (-1.6, 1.6):
                box(nm('up'), xs - .05, xs + .05, 0, 2.6, -.35, .35, 'S_iron')
            for y in (.3, 1.0, 1.7, 2.4):
                sag = rng.uniform(0, .18) if burned else 0
                box(nm('shf'), -1.6, 1.6, y - sag, y + .04 - sag, -.35, .35, 'S_iron')
                if rng.random() < (.55 if burned else .9):
                    # (S3: a burned case's books are charred black spines, not the soot panel -- on a
                    # shelf the panel's tufa ground read as pink cardboard, LOOKED)
                    quad(nm('bk'), [(-1.5, y + .04 - sag, .3), (1.5, y + .04 - sag, .3), (1.5, y + .55 - sag, .3), (-1.5, y + .55 - sag, .3)], 'S_char' if burned else 'R_books', (0, 0, 1))
                    quad(nm('bk'), [(1.5, y + .04 - sag, -.3), (-1.5, y + .04 - sag, -.3), (-1.5, y + .55 - sag, -.3), (1.5, y + .55 - sag, -.3)], 'S_char', (0, 0, -1))
    # fallen beams and a heap of burned books where a case gave way
    for (x, z, ang, L) in ((-6.2, .4, .35, 5.0), (-1.4, -4.6, -.5, 3.6)):
        with G.at(M=T(x, f0 + .15, z) @ RY(ang) @ Matrix.Rotation(.12, 4, 'Z')):
            box(nm('fb'), -L / 2, L / 2, -.15, .15, -.15, .15, 'S_char')
    for k in range(5):
        a_ = rng.uniform(0, 6.28); r_ = rng.uniform(0, .6)
        with G.at(M=T(-8.6 + math.cos(a_) * r_, f0 + .02 + k * .06, 0.4 + math.sin(a_) * r_) @ RY(rng.uniform(0, 3.14))):
            box(nm('bkh'), -.25, .25, 0, .06, -.18, .18, 'S_char')
    # S3 (L2; MM-5 "a burned shelf that reads as burned: soot, fallen timbers, roofless bays"; LOOKED:
    # under the open north half the floor was swept clean but for two beams). WHAT THE ROOF LEFT WHEN
    # IT CAME DOWN, all in the roofless half (x < 0), never neat (ruling 11): a heap of charred rafters
    # and roof timbers against the north wall where the ridge fell, a rafter still leaning from the
    # floor to the broken wall top, another fallen across a case, broken pantiles strewn under the
    # break and drifted against the back wall. The ways in to Corvo (2, 3), Thrale (-4.5, 2), the
    # bench (6, -3) and the books (-6, -3) stay open; the heaps and the cases are solid (`walls`)
    for k in range(9):
        a_ = rng.uniform(0, 6.28); r_ = rng.uniform(0, 1.0); L_ = rng.uniform(1.4, 3.0)
        with G.at(M=T(-9.0 + math.cos(a_) * r_ * .7, f0 + .1 + rng.uniform(0, .5) * (1 - r_), 1.2 + math.sin(a_) * r_ * 1.4)
                  @ RY(rng.uniform(0, 3.14)) @ Matrix.Rotation(rng.uniform(-.35, .35), 4, 'Z') @ Matrix.Rotation(rng.uniform(-.2, .2), 4, 'X')):
            box(nm('hp'), -L_ / 2, L_ / 2, -.09, .09, -.11, .11, 'S_char')
    # the rafter leaning from the floor to the north wall's broken top, and its fellow fallen across
    # the case at (-7.6, 3.4)
    for (x0_, z0_, x1_, y1_, z1_) in ((-6.4, 5.0, -10.05, 6.3, 5.4), (-5.6, 2.2, -9.6, f0 + 2.1, 3.9)):
        dx_, dy_, dz_ = x1_ - x0_, y1_ - f0, z1_ - z0_
        L_ = math.sqrt(dx_ * dx_ + dy_ * dy_ + dz_ * dz_)
        d_ = Vector((dx_, dy_, dz_)).normalized()
        with G.at(M=T(x0_, f0, z0_) @ Vector((0, 0, 1)).rotation_difference(d_).to_matrix().to_4x4()):
            box(nm('lr'), -.1, .1, -.08, .08, 0, L_, 'S_char')
    # broken pantiles: chips strewn under the break and drifted against the back wall
    for (cx_, cz_, n_, sp_) in ((-3.6, 4.6, 14, 1.3), (-9.2, -4.8, 12, 1.0), (-5.0, -1.6, 6, 1.5)):
        for k in range(n_):
            with G.at(M=T(cx_ + rng.uniform(-sp_, sp_), f0 + .015 + rng.uniform(0, .05), cz_ + rng.uniform(-sp_, sp_) * .7)
                      @ RY(rng.uniform(0, 6.28)) @ Matrix.Rotation(rng.uniform(-.25, .25), 4, 'X')):
                # (a stone swatch: MC_Roof would be one more submesh; A-13: smoke-dulled, LOOKED -- clean
                # terracotta read as bright orange chips on the charred floor)
                box(nm('tc'), -.17, .17, 0, .025, -.12, .12, 'S_cotta', tint=lin(.55))
    cases = ((-8.3, -3.0), (-7.6, 3.4), (-2.6, -3.3), (-2.4, 3.6), (2.6, -3.3), (7.8, 3.4))
    record('bs_in', w=22.0, d=14.0, floors=[f0], stairs=[], holes=[], rooms=[[-ix, -iz, ix, iz, f0, 8.7]],
           walls=[[x - 1.6, z - .4, x + 1.6, z + .4, .4] for (x, z) in cases] + [[-ix, -.4, -7.6, 2.8, .5], [-9.7, 4.3, -6.2, 6.0, .4]],
           frame='civic: origin the footprint centre, +z the front (east, its door); the roof is gone over x < 0 (north)')


def al_in():
    """The Alchemists' inside: the furnace against the stack (an ember glow), benches with
    retorts, shelves of jars, a press of drawers, kegs of salts, a lectern with the receipt
    book. Imre's spot (0, 1) stays clear."""
    f0 = .6
    def furnish(ix, iz):
        with G.at(M=T(-2.5, f0, -2.5)):
            box(nm('fur'), -1.0, 1.0, 0, 1.4, -1.0, 1.0, 'Basalt')
            quad(nm('mouth'), [(-.5, .2, 1.01), (.5, .2, 1.01), (.5, .9, 1.01), (-.5, .9, 1.01)], 'S_ember', (0, 0, 1))
            lathe(nm('core'), [(0, .25, False), (.3, .4, True), (0, .7, False)], 'Glow', seg=6, cz=.85)
        for x in (1.5, 3.5):
            table(x, 2.0, f0, w=1.6, d=.8)
            for k in range(3):
                # a round-bottomed flask with a neck (the pointed profile read as a crystal)
                lathe(nm('ret'), [(0, .78, False), (.09, .8, False), (.13, .87, False), (.1, .95, False), (.04, .99, False), (.035, 1.12, False), (0, 1.12, False)],
                      'S_water', seg=8, cx=x - .5 + k * .5, cy=f0, cz=2.0)
        with G.at(M=T(ix, 0, 0) @ RY(-math.pi / 2)):
            obox(nm('shv'), -3.0, 3.0, f0, f0 + 2.4, 0, .4, 'Timber', omit=('-y', '-z'))
            quad(nm('jars'), [(-2.9, f0 + .1, .41), (2.9, f0 + .1, .41), (2.9, f0 + 2.3, .41), (-2.9, f0 + 2.3, .41)], 'X_goods', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        cabinet(2.0, -iz, f0, w=1.6, h=1.8)
        for z in (3.4, 4.2):
            lathe(nm('keg'), [(.28, 0, True), (.33, .3, True), (.28, .6, True), (0, .6, False)], 'S_oak', seg=8, cx=-4.6, cy=f0, cz=z)
        lectern(-2.6, 2.4, f0, math.pi / 2)
        box(nm('work'), -.6, .6, f0, f0 + .9, -4.9, -4.3, 'S_oak')
        box(nm('mortar'), -.15, .15, f0 + .9, f0 + 1.05, -4.75, -4.45, 'Basalt')
    wins = [(s, x, 2.1, .8, 1.5) for s, xs in (('n', (-3.4, 3.4)), ('s', (-3, 0, 3)), ('e', (-3, 0, 3)), ('w', (-3, 0, 3))) for x in xs]
    civic_in('al_in', 6.0, 6.0, [f0], 7.55, (-.75, .75, f0 + 2.8), [], [], wins, furnish, recess=.8)


# ====================================================================== ground pieces (trim: no night glow)
def quay_wall():
    """4 m of quay face on the mere's quay line (MOONMERE.md: faces at o = 0 standing on the
    dredged bed at -4.0, coping at 1.0). Origin: the coping's top at the face line (place
    at y = 1.0), +z the water; the face runs down to -5.2 (0.2 into the bed), the broad
    pale coping deck runs back 1.5 m over the apron's edge (the 0.6 m ledge collider is
    the planner's). A weed line at high water, an iron ring."""
    if far():
        quad(nm('qf'), [(-2, -5.2, .25), (2, -5.2, .25), (2, -.35, 0), (-2, -.35, 0)], 'S_iron', (0, .05, 1))
        quad(nm('qc'), [(-2, 0, .22), (2, 0, .22), (2, 0, -1.5), (-2, 0, -1.5)], 'S_lime_s', (0, 1, 0))
        quad(nm('qcf'), [(-2, -.38, .22), (2, -.38, .22), (2, 0, .22), (-2, 0, .22)], 'S_lime_s', (0, 0, 1))
        return
    quad(nm('qf'), [(-2, -5.2, .25), (2, -5.2, .25), (2, -.35, 0), (-2, -.35, 0)], 'Basalt', (0, .05, 1))
    box(nm('qc'), -2, 2, -.38, .0, -1.5, .22, 'Pale')
    pbox(nm('qsc'), -2, 2, -1.05, -.85, .12, .2, 'Pale')
    for x in (-1.0, 1.0):
        prism(nm('qbt'), [(.08, -5.2), (.5, -5.2), (.3, -1.2), (.12, -.9)], x - .25, x + .25, 'Basalt', axis='x')
    if not far():
        # (S2 review, LOOKED from the water at the west quay: the weed line in the moss swatch read
        # as a bright green band at the waterline between the piers -- the tide's damp line, dark)
        quad(nm('qw'), [(-2, -2.35, .148), (2, -2.35, .148), (2, -2.0, .13), (-2, -2.0, .13)], 'S_soot', (0, .05, 1))
        lathe(nm('qr'), [(.12, -.02, True), (.16, -.02, True), (.16, .02, True), (.12, .02, True)], 'S_iron', seg=8,
              M=T(-1, -1.0, .12) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)


def quay_stair():
    """8 m of water stairs (the mock-up's review fix): an open flight down the quay face to
    a landing at the waterline (sea -1.25 absolute = -2.25 here) with an iron rail, a boat
    door in the face, mooring piles and rings. Origin and frame as quay_wall."""
    zw = -2.25
    Hb = hole(-3.1, -1.1, -5.2, -1.0, .55, 8)
    wall(-4, 4, -5.2, -.35, 'Basalt', [Hb], z=0)
    reveal(Hb, 0, .6, 'BasaltS', sill=False, head_from=None if far() else -.25)
    infill(Hb, -.6, 'R_loft')
    voussoirs(Hb, .38, .06, -.25, n=9, surfs=('Pale', 'Basalt'))
    box(nm('qc'), -4, 4, -.38, .0, -1.5, .22, 'Pale')
    n_ = 7; x0, x1 = .3, 3.1; rise = (0 - .3 - (zw + .3)) / n_
    for k in range(n_):
        xa = x0 + (x1 - x0) * k / n_; xb = x0 + (x1 - x0) * (k + 1) / n_
        yt = -.3 - k * rise
        box(nm('qs'), xa, xb + .02, yt - .42, yt, 0, 1.3, 'Pale' if k % 3 else 'Basalt')
    prism(nm('qsg'), [(x0, -.3 - .42), (x1, -.3 - n_ * rise - .42), (x1, -.3 - n_ * rise - .9), (x0, -.3 - .9)], 1.1, 1.4, 'Basalt')
    box(nm('ql'), x1, 4.0, -5.2, zw + .3, 0, 1.4, 'Basalt')
    box(nm('qlc'), x1 - .02, 4.02, zw + .3, zw + .42, -.02, 1.44, 'Pale')
    if not far():
        for k in range(5):
            x = x0 + .1 + (x1 - x0 - .2) * k / 4; y = -.3 - (x - x0) / (x1 - x0) * n_ * rise
            box(nm('qrp'), x - .025, x + .025, y, y + .95, 1.3, 1.35, 'S_iron')
        prism(nm('qrr'), [(x0 + .1, -.3 + .95), (x1 - .1, -.3 - n_ * rise + .95 + .18), (x1 - .1, -.3 - n_ * rise + .95 + .12), (x0 + .1, -.3 + .95 - .06)], 1.3, 1.36, 'S_iron')
        for xr in (-3.6, -.5, 3.6):
            lathe(nm('qr'), [(.12, -.02, True), (.16, -.02, True), (.16, .02, True), (.12, .02, True)], 'S_iron', seg=8,
                  M=T(xr, -1.0, .12) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False)
    for xp in (-3.4, -.6, 2.2):
        lathe(nm('pile'), [(.17, -5.2, True), (.17, .35, True), (.12, .5, True), (0, .55, False)], 'Timber', seg=8, cx=xp, cz=2.6, smooth=False)
        if not far():
            lathe(nm('pbd'), [(.19, -.2, True), (.19, -.05, True)], 'S_iron', seg=8, cx=xp, cz=2.6, caps=False)


def flight_seg():
    """One street-flight segment (MOONMERE.md: 4 risers of 0.25 on treads of 0.52, 5.0 m
    wide, stretched 0.5-1.4 in x). Origin: the foot's centre on the lower landing at the
    first riser's face; it climbs along +z to (z 2.08, y 1.0). A basalt tread every
    fourth riser; the treads run down 0.6 so no terrain shows under them."""
    for k in range(4):
        y1 = (k + 1) * .25
        surf = 'Basalt' if k == 3 else 'Pale'
        # only the faces that show (the buried bottoms and the faces under the next tread go)
        obox(nm('tr'), -2.5, 2.5, -.6, y1, k * .52, 2.08 if k == 3 else (k + 1) * .52 + .02, surf, omit=('-y',) if k == 3 else ('-y', '+z'))
        if not far():
            obox(nm('ns'), -2.5, 2.5, y1 - .05, y1 + .005, k * .52 - .03, k * .52 + .07, 'Basalt' if k != 3 else 'Pale', omit=('-y', '+z'))
            obox(nm('gut'), -2.5, -2.25, (k + 1) * .25 - .02, (k + 1) * .25 + .01, k * .52 + .07, (k + 1) * .52, 'Basalt', omit=('-y', '-z', '+z'))


def flight_seg_l1():
    pts = [(0, -.6), (0, .25), (.52, .25), (.52, .5), (1.04, .5), (1.04, .75), (1.56, .75), (1.56, 1.0), (2.08, 1.0), (2.08, -.6)]
    vs = [(-2.5, y, z) for z, y in pts] + [(2.5, y, z) for z, y in pts]
    n = len(pts)
    # its sawtooth and the face behind it only: the ends stand against the cheek walls and the
    # bottom is buried (LOD1 <= 25% of the leaner LOD0)
    mesh(nm('fl1'), vs, [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n - 2)], 'S_lime_s', normals2=[
        Vector((0, 0, -1)) if pts[i][0] == pts[i + 1][0] else Vector((0, 1, 0)) for i in range(n - 2)])


def cheek_wall():
    """The banded wall beside a flight, one segment long (2.08 run, 1.0 rise): its top
    follows the nosing line 0.9 over it, a pale coping, a basalt band; 0.4 thick (x 0..0.4:
    the planner sets it at the flight's edge, either side, at the flight's yaw)."""
    prof = [(0, -1.2), (2.08, -.2), (2.08, 1.9), (0, .9)]
    prism(nm('cw'), [(z, y) for z, y in prof], 0, .4, 'Tufa', axis='x')
    prism(nm('cc'), [(0, .9), (2.08, 1.9), (2.08, 2.02), (0, 1.02)], -.05, .45, 'Pale', axis='x')
    if not far():
        prism(nm('cb'), [(0, .45), (2.08, 1.45), (2.08, 1.62), (0, .62)], -.03, .43, 'Basalt', axis='x')


def flight_flank():
    """The flank wall under a flight's cheek (MOONMERE.md section 5 "Requested templates (A-3)"):
    the cheek wall's face carried down to the ground, so a cross stair stands on its own
    masonry and the terrain under it only ever cuts (FLIGHT_BODIES, no grassy hump). Frame:
    cheek_wall's (x 0..0.4 at the flight's edge, z 0..2.08 along one flight_seg's run, origin
    at the segment's foot level); y from the cheek's underside -- lapped 0.2 -- down to -7.2,
    its foot buried wherever the ground is higher. Tufa ashlar with one basalt course line
    parallel to the flight, plain; both long faces (the flight's underside is seen from
    either side of an open landing), no ends (segments abut). Stretch z to flank a landing."""
    top = [(0, -1.0), (2.08, 0.0)]
    for x, f in ((-.05, -1), (.45, 1)):
        P = [(x, -7.2, 0), (x, -7.2, 2.08), (x, top[1][1], 2.08), (x, top[0][1], 0)]
        mesh(nm('ff'), P, [(0, 1, 2, 3)], 'Tufa', facing=(f, 0, 0))
    prism(nm('ffb'), [(0, -1.75), (2.08, -.75), (2.08, -.6), (0, -1.6)], -.08, .48, 'Basalt', axis='x')


def cheek_landing():
    """A-7 (the walk and look reviews): the cheek and flank along a stair street's LANDING.
    The flights carried cheek_wall and flight_flank, the landings between them nothing -- a
    walker stepped off a landing's open side 2.4-3.2 m to the street, and from the side the
    landing read as a slab floating over a grassy cut. One 2.0 m run, flat, in cheek_wall's
    frame (x 0..0.4 at the landing's edge, z 0..2.0 along it, stretched in z to the landing;
    origin at the landing's level): the same coping 0.9 over the landing, the same basalt
    band, and the flank carried down to -7.2 with flight_flank's course line."""
    L = 2.0
    prism(nm('clw'), [(0, -7.2), (L, -7.2), (L, .9), (0, .9)], 0, .4, 'Tufa', axis='x')
    prism(nm('clc'), [(0, .9), (L, .9), (L, 1.02), (0, 1.02)], -.05, .45, 'Pale', axis='x')
    if not far():
        prism(nm('clb'), [(0, .45), (L, .45), (L, .62), (0, .62)], -.03, .43, 'Basalt', axis='x')
        prism(nm('clf'), [(0, -1.75), (L, -1.75), (L, -1.6), (0, -1.6)], -.08, .48, 'Basalt', axis='x')


def lane_wall():
    """4 m of banded garden wall, 3 m, both faces, a tiled coping (garden walls on both
    sides of a flight crossing a riser: ruling 2's note)."""
    t = .6; top = 3.0
    for z, f in ((0, 1), (-t, -1)):
        quad(nm('lw'), [(-2, -2.4, z), (2, -2.4, z), (2, .6, z), (-2, .6, z)], 'Basalt', (0, 0, f))
        quad(nm('lw'), [(-2, .6, z), (2, .6, z), (2, top, z), (-2, top, z)], 'Tufa', (0, 0, f))
    box(nm('lwb'), -2, 2, .55, .72, -t - .04, .04, 'Pale')
    box(nm('lwb'), -2, 2, 2.0, 2.18, -t - .03, .03, 'Basalt')
    quad(nm('cop'), [(-2, top - .05, .14), (2, top - .05, .14), (2, top + .26, -t / 2), (-2, top + .26, -t / 2)], 'Pantile', (0, 1, 1))
    quad(nm('cop'), [(2, top - .05, -t - .14), (-2, top - .05, -t - .14), (-2, top + .26, -t / 2), (2, top + .26, -t / 2)], 'Pantile', (0, 1, -1))
    box(nm('ridge'), -2, 2, top + .22, top + .33, -t / 2 - .07, -t / 2 + .07, 'Ridge')


def parapet_run():
    """4 m of parapet on a walking edge (MOONMERE.md: one CONTINUOUS run, never the mock-up's
    staggered segments; ruling 2: not a retaining wall). Origin: the walk-side face's foot
    (the walk's level), +z toward the walk. 1.1 m high, 0.45 thick, its outer face carried
    1.6 m down over the riser's lip so no daylight or grass shows under it."""
    t = .45
    # S1 (the Crown report's "the tufa parapets read plain at eye level"): a BALUSTRADE between
    # solid piers -- one pier a run (x -2..-1.45, so the runs abutting every 4 m give a pier every
    # 4 m), a tufa base with its basalt band, twelve squared pale balusters, a pale rail. The
    # riser's drop shows between the balusters; the outer face is still carried 1.6 m down over
    # the lip, so no daylight or grass shows under it (the walk's collider is the planner's)
    yb, yr = .42, .95
    xp = -1.45
    quad(nm('pi'), [(-2, -.3, 0), (2, -.3, 0), (2, yb, 0), (-2, yb, 0)], 'Tufa', (0, 0, 1))
    quad(nm('po'), [(2, -1.6, -t), (-2, -1.6, -t), (-2, yb, -t), (2, yb, -t)], 'Tufa', (0, 0, -1))
    quad(nm('pbt'), [(xp, yb, 0), (2, yb, 0), (2, yb, -t), (xp, yb, -t)], 'Pale', (0, 1, 0))
    # the pier: its two faces, its side into the balustrade, a pale cap under the rail
    quad(nm('ppi'), [(-2, yb, 0), (xp, yb, 0), (xp, yr, 0), (-2, yr, 0)], 'Tufa', (0, 0, 1))
    quad(nm('ppo'), [(xp, yb, -t), (-2, yb, -t), (-2, yr, -t), (xp, yr, -t)], 'Tufa', (0, 0, -1))
    quad(nm('pps'), [(xp, yb, 0), (xp, yb, -t), (xp, yr, -t), (xp, yr, 0)], 'Tufa', (1, 0, 0))
    box(nm('pc'), -2, 2, yr, PARAPET, -t - .06, .06, 'Pale')
    box(nm('pb'), -2, 2, .2, .34, -t - .03, .03, 'Basalt')
    n_ = 10
    for k in range(n_):
        x = xp + .19 + (2 - .14 - xp - .19) * k / (n_ - 1)
        lathe(nm('bal'), [(.075, yb, True), (.05, yb + .12, True), (.1, yb + .3, True), (.05, yr - .06, True),
                          (.075, yr, False)], 'Pale', seg=4, phase=math.pi / 4, cx=x, cz=-t / 2, caps=False, smooth=False, urep=1)
    if not far():
        box(nm('pob'), -2, 2, -1.6, -1.3, -t - .05, -t + .01, 'Basalt')


def kerb():
    """4 m of basalt kerb, 0.25 wide, 0.15 proud (0.3 buried)."""
    box(nm('kb'), -2, 2, -.3, .15, -.125, .125, 'Basalt')


def pier_deck():
    """A 4 x 4 m timber deck segment on iron-banded piles (the Inn Pier, the Harbour Jetty;
    D-15). Origin: the deck's top centre; +z along the pier."""
    # boards, bearers and the cross-beam keep only the faces that show: the boards' tops and
    # edges, the bearers' sides and undersides (the segments abut end to end)
    for x in (-1.75, -.875, 0.0, .875, 1.75):
        obox(nm('bd'), x - .43, x + .43, -.12, 0, -2.0, 2.0, 'Timber', omit=('-y', '-z', '+z'))
    for x in (-1.9, 1.9):
        obox(nm('bm'), x - .12, x + .12, -.5, -.12, -2.0, 2.0, 'Timber', omit=('+y', '-z', '+z'))
    # (A-13, the S3 review's pale seam down the Inn Pier: the 1.5 cm gaps between the boards showed the
    # water through them, a broken pale-and-blue line at a distance. A dark plate under the boards)
    quad(nm('ul'), [(-2.18, -.11, 2.0), (2.18, -.11, 2.0), (2.18, -.11, -2.0), (-2.18, -.11, -2.0)], 'S_hull', (0, 1, 0))
    obox(nm('xb'), -2.0, 2.0, -.45, -.12, -.12, .12, 'Timber', omit=('+y', '-x', '+x'))
    for x in (-1.9, 1.9):
        lathe(nm('pile'), [(.18, -5.5, True), (.18, .25, True), (0, .42, False)], 'Timber', seg=6, cx=x, cz=-1.6, smooth=False)
        if not far():
            lathe(nm('pb'), [(.2, -2.2, True), (.2, -2.0, True)], 'S_iron', seg=6, cx=x, cz=-1.6, caps=False)


def riser_rock(l1=False):
    """4 m of BARE basalt riser (D-16; ruling 2: rock, never a retaining wall), for a 7.2 m
    rise (stretched in y to 6.2 for R1): columnar facets standing 0.3-0.6 proud of the
    terrain's 2.4 m ramp, the foot buried 0.3 in the lower ground, the top tucked under
    the upper level's edge. Origin: the ramp's foot at the lower ground, +z toward the
    lower ground; the face leans back to (z -2.4, y 7.2)."""
    import random
    nx, ny = (3, 4) if l1 else (8, 9)
    rng = random.Random(1609)
    cols = [rng.uniform(-.15, .15) for _ in range(nx + 1)]
    vs, fs, uvs = [], [], []
    for j in range(ny + 1):
        t = j / ny
        y = -.3 + t * 7.8
        zr = .45 - 2.4 * min(1, max(0, (y + .3) / 7.5)) * 1.0
        for i in range(nx + 1):
            x = -2 + 4 * i / nx
            jit = 0 if i in (0, nx) else cols[i] + rng.uniform(-.08, .08)
            dz = 0 if l1 else (.25 * math.sin(i * 2.1 + j * .7) + .12 * math.sin(j * 1.9)) * (1 if 0 < j < ny else .3)
            vs.append((x + (0 if l1 else jit * .6), y, zr + dz + .1))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            fs.append((a, a + 1, a + nx + 2, a + nx + 1))
            uvs.append([((vs[q][0] + 2) / 4, (vs[q][1] + .3) / 7.8) for q in (a, a + 1, a + nx + 2, a + nx + 1)])
    mesh(nm('rock'), vs, fs, 'Rock', uvs=uvs, facing=(0, .3, 1))


# ---------------------------------------------------------------- foliage (look pass M2, 2026-10-06)
# "The dressing is cruder than the architecture: lumpy low-poly lemon crowns with hexagonal
# lemons, vines as flat diamond cards on a stick" (the foundation check). The answer is the
# nature remake's (client/src/trees.ts): a crown is many small leaf CLUSTERS whose normals
# point out from the crown's centre, so it shades as one soft rounded mass, lit on top and
# falling off round the sides -- here as OPAQUE leaf-outline polygons (the sheet is a JPEG:
# no alpha) textured with a painted leaf picture, over a dark core that closes the gaps.
def _frame_of(n):
    n = Vector(n).normalized()
    t = Vector((0, 1, 0)).cross(n)
    if t.length < 1e-4: t = Vector((1, 0, 0))
    t.normalize(); b = n.cross(t).normalized()
    return n, t, b


def leaf_clusters(name, items, surf, centre, blend=.7, tint=1.0, npts=8, dome=.14, inner=.6):
    """Leaf-outline polygons as ONE mesh. items: [(P, normal, size, rot, (u0, v0, s), stretch)]
    -- a star of npts points (alternate points pulled in to `inner`) round a raised centre,
    UV'd onto a window (u0, v0, s) of the rect; stretch scales its local up (racemes hang).
    centre: the soft-mass centre for the FOLIAGE NORMALS (geom NCENTRE)."""
    vs, fs, uvs, ns = [], [], [], []
    for (P, nrm, size, rot, (u0, v0, s), stretch) in items:
        n, t, b = _frame_of(nrm)
        P = Vector(P)
        base = len(vs)
        vs.append(tuple(P + n * size * dome))
        uv = [(u0 + s * .5, v0 + s * .5)]
        for k in range(npts):
            a = rot + 2 * math.pi * k / npts
            r = size * (1.0 if k % 2 == 0 else inner)
            lx, ly = math.cos(a) * r, math.sin(a) * r * stretch
            vs.append(tuple(P + t * lx + b * ly))
            uv.append((u0 + s * (.5 + .5 * lx / (size * 1.0)), v0 + s * (.5 + .5 * ly / (size * stretch))))
        for k in range(npts):
            i1, i2 = base + 1 + k, base + 1 + (k + 1) % npts
            fs.append((base, i1, i2))
            uvs.append([uv[0], uv[1 + k], uv[1 + (k + 1) % npts]])
            ns.append(n)
    if fs:
        mesh(nm('leafc'), vs, fs, surf, uvs=uvs, normals2=ns, smooth=True, tint=tint, nc=(*centre, blend))


def _uvwin(rng, s=.46):
    return (rng.uniform(.02, .98 - s), rng.uniform(.02, .98 - s), s)


def _fib(n):
    """n directions spread evenly over a sphere (the golden spiral), deterministic."""
    out = []
    g = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - 2 * (i + .5) / n
        r = math.sqrt(max(0, 1 - y * y))
        out.append(Vector((math.cos(g * i) * r, y, math.sin(g * i) * r)))
    return out


def crown(C, R, n, surfs, rng, size=(.26, .36), core=True, tint=1.0, skip_below=-.55):
    """A tree crown: a dark core ellipsoid and n leaf clusters on its skin. C centre, R radii
    (x, y, z); surfs [(surf, weight)] share the clusters out (lemon pictures among the leaves)."""
    C = Vector(C)
    if core:
        prof = [(0, -R[1] * .8, False), (R[0] * .55, -R[1] * .62, False), (R[0] * .8, 0, False),
                (R[0] * .6, R[1] * .6, False), (0, R[1] * .8, False)]
        lathe(nm('core'), [(r, y, h) for r, y, h in prof], 'S_leafd', seg=7, cx=C.x, cy=C.y, cz=C.z, caps=False)
    groups = {}
    tot = sum(w for _, w in surfs)
    for d in _fib(n):
        if d.y < skip_below: continue
        k = rng.uniform(.95, 1.03)
        P = C + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * k
        nrm = Vector((d.x / R[0], d.y / R[1], d.z / R[2])).normalized()
        nrm = (nrm + Vector((rng.uniform(-.18, .18), rng.uniform(-.1, .2), rng.uniform(-.18, .18)))).normalized()
        pick = rng.uniform(0, tot); acc = 0
        for s_, w in surfs:
            acc += w
            if pick <= acc: break
        hgt = 'hi' if d.y > .3 else ('lo' if d.y < -.2 else 'mid')
        groups.setdefault((s_, hgt), []).append((P, nrm, rng.uniform(*size), rng.uniform(0, 6.28), _uvwin(rng, .34), 1.0))
    for (s_, hgt), items in sorted(groups.items()):
        # iteration 2: rounder, flatter rosettes (inner .74, a low dome) that hug the core; the
        # spiky stars of iteration 1 stuck out of the silhouette like torn paper
        leaf_clusters(f'{s_}{hgt}', items, s_, tuple(C), blend=.8, tint=tint * {'hi': 1.1, 'mid': 1.0, 'lo': .8}[hgt], npts=7, inner=.74, dome=.1)


def fruit(P, surf='S_lemon', s=1.0):
    """A lemon: a smooth spindle, pointed at both ends (no faceted hexagon)."""
    lathe(nm('lem'), [(0, -.075 * s, False), (.048 * s, -.048 * s, False), (.064 * s, 0, False), (.05 * s, .05 * s, False),
                      (0, .085 * s, False)], surf, seg=6, cx=P[0], cy=P[1], cz=P[2], caps=False)


def stem_strip(pts, w, surf='S_oak', facing=(0, 0, 1), tint=.8):
    """A thin woody stem as a ribbon of quads facing out from the wall (pts in order)."""
    vs, fs = [], []
    f = Vector(facing)
    for i, p in enumerate(pts):
        p = Vector(p)
        a = Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])
        side = a.cross(f).normalized() * (w * (1 - .5 * i / max(1, len(pts) - 1)) / 2)
        vs += [tuple(p - side), tuple(p + side)]
    for i in range(len(pts) - 1):
        q = 2 * i; fs.append((q, q + 1, q + 3, q + 2))
    mesh(nm('stem'), vs, fs, surf, facing=tuple(f), tint=tint)


# ====================================================================== dressing
def lamp_bracket():
    """A lantern on an iron wall bracket (origin on the wall face, the lamp out along +z):
    lit at night through MC_Glow (a glow member), no point light (ruling 16)."""
    # a scrolled iron bracket, a slim hexagonal lantern hung from it (iteration 1: the box
    # lantern read heavy and black against the light tufa)
    box(nm('lb'), -.02, .02, .0, .04, 0, .55, 'S_iron')
    prism(nm('lbr'), [(0, 0), (.48, 0), (.48, -.03), (.05, -.33), (0, -.35)], -.015, .015, 'S_iron', axis='x')
    box(nm('lhk'), -.008, .008, -.12, 0, .5, .516, 'S_iron')
    lathe(nm('lcap'), [(.13, -.24, True), (.05, -.14, True), (0, -.12, False)], 'S_iron', seg=6, cz=.508)
    lathe(nm('lg'), [(.1, -.56, True), (.1, -.25, True)], 'Glow', seg=6, cz=.508, caps=True)
    lathe(nm('lbt'), [(.06, -.64, True), (.11, -.57, True), (.11, -.55, True), (0, -.55, False)], 'S_iron', seg=6, cz=.508)


def lamp_lantern():
    """VARIANT of the 'lamp' mount (look pass M2): a swan-neck iron arm with a round caged
    lantern hanging from a chain link -- heavier and lower than lamp_bracket."""
    vs = []
    pts = [(0, -.05), (0, .1), (.14, .22), (.34, .27), (.52, .22), (.62, .1), (.64, -.02)]
    prism(nm('sw'), [(z, y) for z, y in pts] + [(.6, -.02), (.58, .08), (.5, .17), (.34, .21), (.16, .17), (.04, .07), (.04, -.05)],
          -.018, .018, 'S_iron', axis='x')
    box(nm('bp'), -.07, .07, -.14, .14, -.01, .02, 'S_iron')
    box(nm('ch'), -.008, .008, -.18, -.02, .62, .636, 'S_iron')
    cz = .628
    lathe(nm('lcap'), [(.03, -.18, True), (.16, -.28, True), (.16, -.3, True), (0, -.3, False)], 'S_iron', seg=8, cz=cz)
    lathe(nm('lg'), [(.12, -.6, True), (.15, -.45, True), (.12, -.3, True)], 'Glow', seg=8, cz=cz, caps=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        x, z = math.cos(a) * .155, cz + math.sin(a) * .155
        box(nm('cg'), x - .01, x + .01, -.6, -.3, z - .01, z + .01, 'S_iron')
    lathe(nm('lbt'), [(0, -.68, False), (.08, -.64, True), (.13, -.6, True), (.13, -.59, True), (0, -.59, False)], 'S_iron', seg=8, cz=cz)


def lamp_sconce():
    """VARIANT of the 'lamp' mount (look pass M2): a square glazed lantern close to the wall
    on a short iron shelf with a pyramid hood and a back plate."""
    box(nm('bp'), -.12, .12, -.32, .28, -.01, .02, 'S_iron')
    box(nm('sh'), -.14, .14, -.36, -.32, 0, .3, 'S_iron')
    prism(nm('st'), [(0, -.36), (.26, -.36), (0, -.6)], -.015, .015, 'S_iron', axis='x')
    box(nm('lg'), -.1, .1, -.32, .04, .05, .25, 'Glow')
    for x in (-.11, .11):
        for z in (.04, .26):
            box(nm('lf'), x - .012, x + .012, -.32, .05, z - .012, z + .012, 'S_iron')
    lathe(nm('lc'), [(.2, .05, True), (.2, .08, True), (0, .24, False)], 'S_iron', seg=4, phase=math.pi / 4, cz=.15)


def lamp_post():
    """A standing lamp: a moulded pale-stone plinth (A-7: the review's "oversized navy faceted
    block" is now a slim moulded base, cast-stone pale), an iron post 3.2 m with a collar,
    a lantern under a small cap."""
    lathe(nm('pb'), [(.2, 0, True), (.2, .1, True), (.16, .15, True), (.13, .2, True), (.11, .48, True), (.14, .53, True),
                     (.14, .58, True), (.08, .62, True), (0, .63, False)], 'Pale', seg=8, smooth=True)
    lathe(nm('pp'), [(.05, .6, True), (.04, 2.6, True), (.06, 2.64, True), (.06, 2.7, True), (.04, 2.74, True), (.04, 3.0, True),
                     (.09, 3.05, True), (0, 3.08, False)], 'S_iron', seg=6)
    box(nm('lg'), -.14, .14, 3.08, 3.5, -.14, .14, 'Glow')
    for x in (-.15, .15):
        for z in (-.15, .15):
            box(nm('lf'), x - .02, x + .02, 3.08, 3.5, z - .02, z + .02, 'S_iron')
    lathe(nm('lc'), [(.24, 3.5, True), (0, 3.78, False)], 'S_iron', seg=4, phase=math.pi / 4)


def bench_stone():
    """A carved stone bench (look pass M2: the old one read as a box on two blue blocks): a
    pale seat with a rounded front nosing on two scrolled pale consoles. 1.8 long; origin at
    the wall (or the bench's back line) at the ground, the seat out along +z. Planters and
    benches share the plinth's 'bench' slots (planDressing chooses one or nothing a slot)."""
    prof = [(0, .36), (.4, .36), (.45, .38), (.47, .42), (.45, .455), (.41, .47), (0, .47)]
    prism(nm('seat'), prof, -.9, .9, 'Pale', axis='x')
    # A-7 (the look review: "bench_stone reads as a floating slab"): two solid stone END
    # SUPPORTS under the seat's ends, each on a plinth, the scrolled consoles inside them
    for x in (-.8, .8):
        obox(nm('end'), x - .09, x + .09, .03, .36, .03, .43, 'Pale', omit=('-y',))
        obox(nm('ft'), x - .13, x + .13, 0, .05, 0, .46, 'PaleS', omit=('-y',))
    for x in (-.4, .4):
        G.scroll_console(nm('leg'), x, 0, .36, .38, .12, 'Pale', z0=.04)


def bench_timber():
    """VARIANT of the 'bench' slot and the courts' seats (look pass M2): a slatted timber bench
    with a back on two iron ends, painted in the house's joinery colour (tint class joinery:
    the slats are a neutral swatch, the iron a dark one)."""
    # A-7 (the look review: "a modern slatted park bench with black legs"): TIMBER ENDS in the
    # town's joinery, solid shaped side frames with a scrolled arm, pegged to the slats
    for x in (-.8, .8):
        prism(nm('end'), [(.02, 0), (.16, 0), (.18, .36), (.44, .36), (.46, 0), (.56, 0), (.56, .44), (.52, .62), (.42, .66),
                          (.16, .66), (.1, .97), (0, .97)], x - .045, x + .045, 'S_oak', axis='x')
    for k, (z0, z1) in enumerate(((.12, .22), (.235, .335), (.35, .45))):
        box(nm('sl'), -.9, .9, .44, .48, z0, z1, 'S_sail')
    for y0, y1 in ((.58, .68), (.74, .84)):
        z = .1 - (y0 - .5) * .12
        box(nm('bk'), -.9, .9, y0, y1, z - .03, z + .01, 'S_sail')


def _plaque(surf, uv=False):
    """A glazed tile plaque in a pale frame (look pass M2: moved off the bays onto the 'plaque'
    mount so every bay need not carry the same one). Origin: the wall face at the plaque's
    centre; 0.6 m (scale with axes)."""
    s = .6; f = .07
    # the tile set a little back in a moulded pale frame (four bars: the frame's inner edges
    # shade the tile's rim in the baked occlusion)
    for (x0, x1, y0, y1) in ((-s / 2 - f, s / 2 + f, s / 2, s / 2 + f), (-s / 2 - f, s / 2 + f, -s / 2 - f, -s / 2),
                             (-s / 2 - f, -s / 2, -s / 2, s / 2), (s / 2, s / 2 + f, -s / 2, s / 2)):
        pbox(nm('plqf'), x0, x1, y0, y1, 0, .06, 'Pale')
    quad(nm('plq'), [(-s / 2, -s / 2, .025), (s / 2, -s / 2, .025), (s / 2, s / 2, .025), (-s / 2, s / 2, .025)], surf, (0, 0, 1),
         uvs=[(0, 0), (1, 0), (1, 1), (0, 1)] if uv else None)


def plaque_ring(): _plaque('R_plaque')
def plaque_moon(): _plaque('X_plaque_moon', uv=True)
def plaque_lemon(): _plaque('X_plaque_lemon', uv=True)


def _trough():
    """The planters' tufa trough (1.1 x 0.42), flared to a pale moulded rim, on two feet."""
    prism(nm('pt'), [(-.17, .04), (.17, .04), (.21, .36), (-.21, .36)], -.53, .53, 'Tufa', axis='x')
    box(nm('ptr'), -.58, .58, .34, .42, -.245, .245, 'Pale')
    for x in (-.4, .4):
        box(nm('pf'), x - .08, x + .08, 0, .05, -.15, .15, 'PaleS')


def planter(kind='a'):
    """A tufa trough of flowers (the bays' 'planter' mounts and the 'bench' slots): sits on a
    plinth, a sill or a gallery rail. Look pass M2: the mound is leaf-and-flower CLUSTERS
    (shaded as one mass), not crossed cards. kind 'a' geraniums, 'herb' lavender and daisies,
    'trail' pink pelargonium with ivy trailing over the front."""
    import random as _r
    rng = _r.Random({'a': 31, 'herb': 32, 'trail': 33}[kind])
    _trough()
    quad(nm('soil'), [(-.5, .4, .17), (.5, .4, .17), (.5, .4, -.17), (-.5, .4, -.17)], 'S_soil', (0, 1, 0))
    surf = {'a': 'X_flowers', 'herb': 'X_flowers_b', 'trail': 'X_flowers_c'}[kind]
    ry = .42 if kind == 'herb' else .3
    C = (0, .38, 0)
    items = []
    for i in range(13):
        u = (i + .5) / 13
        x = -.48 + .96 * u + rng.uniform(-.04, .04)
        a = rng.uniform(.15, math.pi - .15)
        P = Vector((x, .4 + math.sin(a) * ry * (1 - (2 * u - 1) ** 2 * .45), math.cos(a) * .2))
        nrm = Vector((x * .8, math.sin(a) * 1.2, math.cos(a))).normalized()
        items.append((P, nrm, rng.uniform(.17, .23), rng.uniform(0, 6.28), _uvwin(rng, .5), 1.0 if kind != 'herb' else 1.3))
    leaf_clusters('fl', items, surf, C, blend=.75)
    if kind == 'trail':
        tr = []
        for x in (-.4, -.12, .18, .42):
            for k in range(3):
                y = .36 - k * .2 - rng.uniform(0, .05)
                tr.append((Vector((x + rng.uniform(-.05, .05), y, .25 + k * .015)), Vector((0, .15, 1)), rng.uniform(.1, .14),
                           rng.uniform(0, 6.28), _uvwin(rng, .4), 1.4))
        leaf_clusters('trail', tr, 'X_ivy', (0, .2, -.4), blend=.5, tint=.95)


def stall_pentice():
    """A timber pentice over a stall (no awnings, MM-1: striped awnings belong to the other
    directions): boards on two brackets, tinted with the house's joinery. Origin: the wall
    at the pentice's top-back centre; 2.6 wide (stretch x), projecting 1.2."""
    p = math.tan(math.radians(22))
    quad(nm('pb'), [(-1.3, -p * 1.2, 1.2), (1.3, -p * 1.2, 1.2), (1.3, 0, 0), (-1.3, 0, 0)], 'R_shutter', (0, 1, p))
    quad(nm('pbu'), [(1.3, -p * 1.2 - .04, 1.2), (-1.3, -p * 1.2 - .04, 1.2), (-1.3, -.04, 0), (1.3, -.04, 0)], 'R_shutter', (0, -1, -p))
    box(nm('pf'), -1.3, 1.3, -p * 1.2 - .14, -p * 1.2 + .02, 1.16, 1.24, 'R_shutter')
    for x in (-1.15, 1.15):
        prism(nm('pbr'), [(0, -.04), (1.1, -p * 1.1 - .04), (1.1, -p * 1.1 - .14), (0, -.9)], x - .05, x + .05, 'R_shutter', axis='x')


def sign(kind):
    """A painted hanging sign (no text: a quill, a cup, a key) on an iron bracket arm.
    Origin on the wall face; the arm runs out along +z, the board hangs under it, painted
    both sides (its u flipped behind, so the picture reads the right way round)."""
    box(nm('arm'), -.03, .03, 0, .05, 0, 1.0, 'S_iron')
    prism(nm('st'), [(0, 0), (.6, 0), (.6, -.04), (.05, -.42), (0, -.45)], -.025, .025, 'S_iron', axis='x')
    with G.at(M=T(0, -.06, .62) @ RY(math.pi / 2)):
        quad(nm('sf'), [(-.38, -.6, .02), (.38, -.6, .02), (.38, -.06, .02), (-.38, -.06, .02)], f'X_sign_{kind}', (0, 0, 1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        quad(nm('sb'), [(.38, -.6, -.02), (-.38, -.6, -.02), (-.38, -.06, -.02), (.38, -.06, -.02)], f'X_sign_{kind}', (0, 0, -1), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        for x in (-.3, .3):
            box(nm('ch'), x - .01, x + .01, -.06, 0, -.01, .01, 'S_iron')


def vine(kind='ivy'):
    """A climber on a wall, rooted at the 'vine' mount (origin at its root on the wall face,
    spreading at most +-1.0 m so it clears the bay's lamp). Look pass M2: woody stems that
    branch, and leaf CLUSTERS standing off the wall at a slant (shaded as one mass), not
    flat cards. kind 'ivy' (vine_wall, dark small leaves to 4 m), 'rose' (a fan-trained
    climbing rose to 3 m), 'wisteria' (a twisted trunk to 4.2 m, an arm along the wall,
    lilac racemes hanging)."""
    import random as _r
    rng = _r.Random({'ivy': 77, 'rose': 78, 'wisteria': 79}[kind])
    top = {'ivy': 4.1, 'rose': 3.0, 'wisteria': 4.2}[kind]
    # the stems: a main one and its branches (x(t) wanders, z just off the wall)
    stems = []
    if kind == 'wisteria':
        main = [(math.sin(t * 5.0) * .08, t * top, .07) for t in [i / 8 for i in range(9)]]
        stems.append((main, .12))
        stems.append(([(.05 + math.sin(t * 7) * .05, t * top * .98, .09) for t in [i / 8 for i in range(9)]], .07))
        for s in (-1, 1):
            stems.append(([(s * t * 1.0, top - .1 + math.sin(t * 6) * .05, .08) for t in [i / 5 for i in range(6)]], .07))
    else:
        main = [(math.sin(t * 4.3 + .4) * .15, t * top, .06) for t in [i / 8 for i in range(9)]]
        stems.append((main, .07))
        for (y0, s, L) in ((1.6, -1, .9), (2.2, 1, .95), (2.9, -1, .7), (3.3, 1, .6)) if kind == 'ivy' else ((1.4, -1, .9), (1.7, 1, .9), (2.2, -1, .6), (2.4, 1, .65)):
            if y0 > top - .3: continue
            stems.append(([(s * L * t + math.sin(t * 3) * .05, y0 + t * (.9 if kind == 'ivy' else .7), .07) for t in [i / 4 for i in range(5)]], .04))
    for pts, w in stems:
        stem_strip(pts, w, 'S_oak' if kind != 'wisteria' else 'R_bark', tint=.75)
    # the leaves. Iteration 2 (2026-10-06: still "leaves on a stick"): a climber is a MASS --
    # clusters fill an envelope on a jittered grid (ivy a tall teardrop widening upward, the
    # rose a fan, the wisteria a band along its arm), standing off the wall in a soft dome
    surf = {'ivy': 'X_ivy', 'rose': 'X_roses', 'wisteria': 'X_foliage'}[kind]
    def half_w(y):
        t = (y - 1.3) / max(.1, top - 1.3)
        if kind == 'ivy': return .25 + .7 * math.sin(min(1, t) * math.pi * .62)
        if kind == 'rose': return .2 + .8 * min(1, t) ** .8
        return 1.0 if y > top - .55 else .16
    items = []
    y = 1.3 if kind != 'wisteria' else 1.3
    step = .28
    row = 0
    while y < top + (.25 if kind == 'wisteria' else .05):
        hw = half_w(y)
        x = -hw + (step / 2 if row % 2 else 0)
        while x <= hw + 1e-6:
            P = Vector((x + rng.uniform(-.06, .06), y + rng.uniform(-.06, .06), 0))
            e = 1 - min(1, abs(P.x) / max(.15, hw))                     # the mass's dome across
            P.z = .07 + .2 * e + rng.uniform(0, .05)
            nrm = Vector((P.x * .9, .35 + rng.uniform(-.15, .2), 1)).normalized()
            if rng.random() < .9 or abs(P.x) < hw * .6:
                items.append((P, nrm, rng.uniform(.17, .24), rng.uniform(0, 6.28), _uvwin(rng, .32), 1.0))
            x += step
        y += step * .82; row += 1
    leaf_clusters('vl', items, surf, (0, top * .6, -1.6), blend=.55, npts=6, inner=.72, dome=.12)
    if kind == 'wisteria':
        rac = []
        for k in range(13):
            x = rng.uniform(-.95, .95); y = top - .25 - rng.uniform(0, .25)
            rac.append((Vector((x, y - .3, .16 + rng.uniform(0, .1))), Vector((rng.uniform(-.2, .2), -.1, 1)), rng.uniform(.13, .17),
                        math.pi / 2, (rng.uniform(.05, .55), .2, .4), 2.4))
        leaf_clusters('rac', rac, 'X_wisteria', (0, top, -1.0), blend=.4, npts=6, inner=.75)


def vine_wall(): vine('ivy')
def vine_rose(): vine('rose')
def vine_wisteria(): vine('wisteria')


def leaf_cards(items, centre, blend=.75):
    """A-7: two-sided ALPHA cards on the leaf sheet (MC_Leaf, alpha tested at runtime), one
    mesh per surface. items: [(P, n, up, size, surf)] -- the card's centre, its facing, the
    in-plane direction its spray grows toward (the sheet's top), its side. Both faces take
    the FOLIAGE NORMALS (geom NCENTRE: away from the crown's centre), so the crown shades as
    one soft mass, lit on top -- the nature remake's crowns, here with real gaps."""
    by = {}
    for (P, n, up, size, surf) in items:
        n = Vector(n).normalized(); up = Vector(up)
        up = (up - n * up.dot(n)).normalized() if (up - n * up.dot(n)).length > 1e-4 else _frame_of(n)[2]
        side = up.cross(n).normalized()
        P = Vector(P); h = size / 2
        c = [P - side * h - up * h, P + side * h - up * h, P + side * h + up * h, P - side * h + up * h]
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
        e = by.setdefault(surf, ([], [], [], []))
        b = len(e[0])
        e[0].extend(tuple(q) for q in c)
        e[1].append((b, b + 1, b + 2, b + 3)); e[2].append(uv); e[3].append(n)
        b = len(e[0])
        e[0].extend(tuple(q) for q in c[::-1])
        e[1].append((b, b + 1, b + 2, b + 3)); e[2].append(uv[::-1]); e[3].append(-n)
    for surf, (vs, fs, uvs, ns) in sorted(by.items()):
        mesh(nm('leafc'), vs, fs, surf, uvs=uvs, normals2=ns, smooth=True, nc=(*centre, blend))


def lemon_crown(C, R, rng, n_out=30, n_fin=14, n_in=6, size=(.62, .82), lemon=.4):
    """A lemon crown of alpha leaf sprays: cards facing out over the crown's skin, FINS
    standing radially through it (their sprays growing outward, so the silhouette is leaves,
    never a card's edge), and a few large cards inside to close the core."""
    C = Vector(C); items = []
    pick = lambda: 'L_spray_lemon' if rng.random() < lemon else 'L_spray'
    for d in _fib(n_out):
        if d.y < -.62: continue
        P = C + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * rng.uniform(.74, .86)
        nrm = (Vector((d.x / R[0], d.y / R[1], d.z / R[2])).normalized() + Vector((0, .35, 0))).normalized()
        up = Vector((rng.uniform(-1, 1), 1.2, rng.uniform(-1, 1)))
        items.append((P, nrm, up, rng.uniform(*size), pick()))
    for d in _fib(n_fin):
        if d.y < -.45: continue
        P = C + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * .55
        out = Vector((d.x, d.y * .6 + .25, d.z)).normalized()
        nrm = out.cross(Vector((0, 1, 0)) if abs(out.y) < .9 else Vector((1, 0, 0))).normalized()
        items.append((P, nrm, out, rng.uniform(size[0] * 1.05, size[1] * 1.15), pick()))
    for k in range(n_in):
        a = k * 2 * math.pi / n_in + rng.uniform(-.3, .3)
        P = C + Vector((math.cos(a) * R[0] * .2, rng.uniform(-.15, .2), math.sin(a) * R[2] * .2))
        nrm = Vector((math.cos(a + 1.57), 0, math.sin(a + 1.57)))
        items.append((P, nrm, Vector((0, 1, 0)), size[1] * 1.35, 'L_spray'))
    leaf_cards(items, tuple(C), blend=.72)


def lemon_tub(pot=False):
    """A lemon tree in a tub (the courts' greens). A-7 (the look review: "at eye level the
    lemon crowns are still balls of flat leaf cards with a faceted silhouette, and the lemons
    are flat yellow hexes"): the crown is now ALPHA leaf sprays on the trees' own sheet
    (mc_leaf.png, MC_Leaf -- moonmere_cloister_atlas.LEAF_RECTS), with lemons among the
    leaves and a few modelled round ones, on a forked trunk; the tub, the pot, the soil and
    the bark are on the same sheet, so a tree is ONE submesh. The tub is a pale tufa planter
    that flares to a moulded rim on a basalt foot; pot (lemon_pot) is the smaller VARIANT, a
    round terracotta pot with a looser, taller, rounder crown of its own."""
    import random as _r
    rng = _r.Random(19 if not pot else 23)
    q = math.sqrt(2)
    if not pot:
        lathe(nm('tub'), [(.40 * q, 0, True), (.40 * q, .1, True), (.38 * q, .12, True), (.45 * q, .58, True), (.52 * q, .6, True),
                          (.52 * q, .72, True), (.46 * q, .74, True), (.44 * q, .7, False)], 'L_tub', seg=4, phase=math.pi / 4, caps=False, smooth=False)
        ys, rr = .7, .44
        quad(nm('soil'), [(-rr, ys, rr), (rr, ys, rr), (rr, ys, -rr), (-rr, ys, -rr)], 'L_soil', (0, 1, 0))
        C, R, tr = (0, 2.2, 0), (.92, .74, .92), (.66, 1.8)
        lemon_crown(C, R, rng, n_out=30, n_fin=14, n_in=6, size=(.66, .86), lemon=.42)
    else:
        lathe(nm('pot'), [(.24, 0, True), (.24, .04, True), (.22, .06, True), (.32, .48, True), (.37, .5, True), (.37, .6, True),
                          (.33, .62, True), (.31, .58, False)], 'L_cotta', seg=10, caps=False)
        ys, rr = .58, .3
        lathe(nm('soil'), [(rr, ys, False), (0, ys, False)], 'L_soil', seg=6, caps=False)
        C, R, tr = (0, 1.72, 0), (.52, .62, .52), (.56, 1.4)
        lemon_crown(C, R, rng, n_out=18, n_fin=9, n_in=4, size=(.5, .66), lemon=.3)
    lathe(nm('trunk'), [(.075 if not pot else .05, tr[0], True), (.05 if not pot else .035, tr[1], True), (.025, tr[1] + .25, False)],
          'L_bark', seg=6, caps=False)
    # the fork: three limbs from the trunk's head out into the crown
    for k in range(3):
        a = k * 2.1 + rng.uniform(-.3, .3)
        P0 = Vector((0, tr[1] - .05, 0))
        P1 = Vector((math.cos(a) * R[0] * .45, tr[1] + R[1] * .55, math.sin(a) * R[2] * .45))
        tube(P0, P1, .035 if not pot else .025, (0, 1, 0), seg=4, surf='L_twig', close=True)
    # a few modelled lemons on the crown's lower skin, round (the painted ones carry the rest)
    for k in range(5 if not pot else 3):
        a = rng.uniform(0, 2 * math.pi); h = rng.uniform(-.5, .15)
        d = Vector((math.cos(a), h, math.sin(a))).normalized()
        P = Vector(C) + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * .92
        s_ = 1.0 if not pot else .85
        lathe(nm('lem'), [(0, -.07 * s_, False), (.045 * s_, -.05 * s_, False), (.058 * s_, 0, False), (.046 * s_, .05 * s_, False),
                          (0, .075 * s_, False)], 'L_fruit', seg=7, cx=P[0], cy=P[1], cz=P[2], caps=False)


def lemon_pot(): lemon_tub(pot=True)


def well_head():
    """An octagonal basalt well, a pale curb, a wrought-iron arched overthrow with a pulley,
    its rope and a bucket (brass painted)."""
    lathe(nm('wb'), [(.95, 0, True), (.95, .78, True), (.62, .78, True), (.62, -.3, False)], 'Basalt', seg=8, phase=math.pi / 8, caps=False, smooth=False)
    lathe(nm('wc'), [(1.02, .78, True), (1.02, .9, True), (.58, .9, True), (.58, .78, True)], 'Pale', seg=8, phase=math.pi / 8, caps=False, smooth=False)
    quad(nm('ww'), [(-.62, .1, .62), (.62, .1, .62), (.62, .1, -.62), (-.62, .1, -.62)], 'S_water', (0, 1, 0))
    for x in (-.8, .8):
        box(nm('wp'), x - .05, x + .05, .9, 2.0, -.05, .05, 'S_iron')
    lathe(nm('warc'), [(.76, -.045, True), (.84, -.045, True), (.84, .045, True), (.76, .045, True)], 'S_iron', seg=12, a0=0, a1=math.pi,
          M=T(0, 2.0, 0) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), caps=False)
    lathe(nm('wpu'), [(0, -.03, False), (.13, -.03, True), (.13, .03, True), (0, .03, False)], 'S_brass_p', seg=8, M=T(0, 2.66, 0) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    box(nm('wr'), -.01, .01, 1.5, 2.6, -.01, .01, 'S_rope')
    lathe(nm('wbk'), [(0, 1.18, False), (.14, 1.18, True), (.17, 1.5, True), (0, 1.5, False)], 'S_brass_p', seg=8)


def cafe_set():
    """The Lemon Court café's table and two chairs (MOONMERE.md: W2, the court café)."""
    lathe(nm('tp'), [(0, .74, False), (.45, .74, True), (.45, .78, True), (0, .78, False)], 'Pale', seg=10)
    lathe(nm('tl'), [(.06, 0, True), (.04, .74, True)], 'S_iron', seg=6, caps=False)
    lathe(nm('tb'), [(.25, 0, True), (.25, .04, True), (0, .05, False)], 'S_iron', seg=8)
    for ang in (0.4, math.pi + .3):
        with G.at(M=RY(ang) @ T(0, 0, .75)):
            box(nm('cs'), -.22, .22, .44, .5, -.22, .22, 'S_oak')
            box(nm('cb'), -.22, .22, .5, .95, .18, .22, 'S_oak')
            for sx in (-.18, .18):
                for sz in (-.18, .18):
                    box(nm('cl'), sx - .025, sx + .025, 0, .44, sz - .025, sz + .025, 'S_iron')
    lathe(nm('cup'), [(0, .78, False), (.05, .78, True), (.05, .86, True), (0, .86, False)], 'S_lime_s', seg=6, cx=.15)


def washing_line():
    """A washing line across a lane (4 m between its hooks, origin at its middle at the
    line's height): a rope with a little sag, three cloths hanging, painted both sides."""
    for x0, x1, y0, y1 in ((-2, 0, 0, -.18), (0, 2, -.18, 0)):
        prism(nm('ln'), [(x0, y0 - .012), (x1, y1 - .012), (x1, y1 + .012), (x0, y0 + .012)], -.012, .012, 'S_rope')
    for x, w, h in ((-1.3, .7, .9), (-.2, .9, .7), (.9, .6, 1.0)):
        y = -.18 * (1 - abs(x) / 2)
        quad(nm('cl'), [(x - w / 2, y - h, 0), (x + w / 2, y - h, 0), (x + w / 2, y, 0), (x - w / 2, y, 0)], 'R_linen', (0, 0, 1))
        quad(nm('clb'), [(x + w / 2, y - h, -.005), (x - w / 2, y - h, -.005), (x - w / 2, y, -.005), (x + w / 2, y, -.005)], 'R_linen', (0, 0, -1))


def crate_stack():
    """Crates, a sack and a barrel on the quay (MOONMERE.md D-12: original harbour clutter)."""
    for (x, z, y, s) in ((-.5, 0, 0, .8), (.45, .1, 0, .7), (-.4, .05, .8, .65)):
        box(nm('cr'), x - s / 2, x + s / 2, y, y + s, z - s / 2, z + s / 2, 'Timber')
        if not far():
            box(nm('crb'), x - s / 2 - .01, x + s / 2 + .01, y + s * .45, y + s * .55, z - s / 2 - .01, z + s / 2 + .01, 'S_oak')
    lathe(nm('bar'), [(.28, 0, True), (.34, .45, True), (.28, .9, True), (0, .9, False)], 'S_oak', seg=8, cx=1.15, cz=-.2)
    for y in (.15, .75):
        lathe(nm('barb'), [(.31, y - .03, True), (.31, y + .03, True)], 'S_iron', seg=8, cx=1.15, cz=-.2, caps=False)
    box(nm('sack'), .25, .85, .7, 1.05, -.2, .25, 'S_sail')


def net_rack():
    """A drying rack of nets: two posts, a pole, a net hung over it, cork floats."""
    for x in (-1.6, 1.6):
        box(nm('np'), x - .06, x + .06, 0, 2.2, -.06, .06, 'Timber')
    box(nm('nb'), -1.8, 1.8, 2.1, 2.22, -.06, .06, 'Timber')
    for z, f in ((.08, 1), (-.08, -1)):
        q = [(-1.5, .4, z * 3), (1.5, .4, z * 3), (1.5, 2.1, z), (-1.5, 2.1, z)]
        quad(nm('nn'), q, 'R_net', (0, .2, f))
    for k in range(6):
        x = -1.3 + k * .52
        box(nm('fl'), x - .06, x + .06, .4, .52, .2, .32, 'S_red')


def crystal_dais():
    """A-7 (the look review: "the crystal stands on a cold grey generic dais whose steps go
    down into a pit cut below the paving"): the teleport crystal's dais in Moonmere's own
    stone, RAISED from Academy Court's flags, never sunk: an octagonal banded step of pale
    tufa and a second of basalt, a pale-coped drum the crystal stands on (its top at 1.32,
    the crystal builder's terrace top + its 1.2 block, so the spire floats where it always
    did), and round it in the paving a MOON RING: a basalt band set with pale crescents.
    Origin: the crystal's axis on the court (14.4); r 3.3 within the builder's collider."""
    ph = math.pi / 8
    # (urep 8 on 8 sides: every face a whole tile, so no face straddles the strip's sheet
    # edge and the packer keeps short UVs)
    lathe(nm('ds1'), [(3.3, -.2, True), (3.3, .32, True), (3.18, .44, True), (2.62, .44, False)], 'Pale', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('ds1b'), [(3.31, .1, True), (3.31, .22, True)], 'Basalt', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('ds2'), [(2.62, .44, True), (2.62, .76, True), (2.5, .88, True), (1.58, .88, False)], 'Basalt', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('ds3'), [(1.58, .88, True), (1.5, 1.18, True), (1.62, 1.2, True), (1.62, 1.32, True), (0, 1.32, False)], 'Pale', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    # the moon ring in the paving: a basalt band 0.5 wide at r 4.0-4.5, eight pale crescents set in it
    lathe(nm('mr'), [(4.5, .012, False), (4.0, .012, False)], 'S_blue', seg=24, caps=False, smooth=False)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        cx, cz = math.cos(a) * 4.25, math.sin(a) * 4.25
        pts = []
        for j in range(7):
            t = math.pi * (j / 6) - math.pi / 2
            pts.append((cx + math.cos(t + a) * .2, cz + math.sin(t + a) * .2))
        for j in range(6, -1, -1):
            t = math.pi * (j / 6) - math.pi / 2
            pts.append((cx + math.cos(t + a) * .12 + math.cos(a) * .06, cz + math.sin(t + a) * .12 + math.sin(a) * .06))
        vs = [(x, .016, z) for x, z in pts]
        mesh(nm('cres'), vs, [tuple(range(len(vs)))], 'S_pale_s', facing=(0, 1, 0))


def hoist_sacks():
    """A-7: what a load bay's hoist holds (the 'hoist' mount, origin the hook): three
    burlap sacks in a rope net, hanging half-hoisted -- bound, round-bottomed, sagging."""
    for k, (x, z, r, h) in enumerate(((-.18, .02, .2, .55), (.17, -.04, .19, .5), (0, .16, .17, .46))):
        y0 = -.75 - h + k * .04
        lathe(nm('sack'), [(0, y0, False), (r * .85, y0 + .05, False), (r, y0 + h * .4, False), (r * .9, y0 + h * .8, False),
                           (r * .45, y0 + h, False), (.04, y0 + h + .08, False)], 'S_sail', seg=7, cx=x, cz=z, caps=False)
    # the net: four ropes from the hook down round the load, and two bands round it
    for (x, z) in ((-.36, -.2), (.36, -.2), (-.3, .3), (.3, .3)):
        tube((0, 0, 0), (x, -.85, z), .012, (0, 1, 0), seg=3, surf='S_rope', close=True)
    for y, rr in ((-.95, .42), (-1.2, .4)):
        lathe(nm('nb'), [(rr, y - .015, True), (rr + .02, y - .015, True), (rr + .02, y + .015, True), (rr, y + .015, True)], 'S_rope', seg=8, caps=False)


def hoist_barrel():
    """A-7: the other thing a hoist holds: an oak barrel in a rope sling, iron hoops."""
    lathe(nm('bar'), [(0, -1.55, False), (.26, -1.55, True), (.31, -1.2, True), (.26, -.85, True), (0, -.85, False)], 'S_oak', seg=8)
    for y in (-1.45, -.95):
        lathe(nm('hp'), [(.285, y - .03, True), (.29, y - .03, True), (.29, y + .03, True), (.285, y + .03, True)], 'S_iron', seg=8, caps=False)
    for (x, z) in ((-.3, 0), (.3, 0)):
        tube((0, 0, 0), (x, -.9, z), .014, (0, 1, 0), seg=3, surf='S_rope', close=True)
        tube((x, -.9, z), (x * .9, -1.55, z), .014, (0, 1, 0), seg=3, surf='S_rope', close=True)


def bollard():
    """A cast-iron mooring bollard (A-7: the old stone drum read as a bin): a flared foot, a
    waisted barrel and a mushroom cap with its lip, so a line can be thrown round it."""
    lathe(nm('bol'), [(.22, 0, True), (.2, .08, True), (.15, .14, True), (.13, .42, True), (.11, .5, True), (.21, .56, True),
                      (.23, .62, True), (.2, .68, True), (.1, .72, True), (0, .73, False)], 'S_iron', seg=10)


def boat(L, B, Hh, mast=False, seed=3):
    """A clinker-built boat (D-12: original, no pirate/* pieces): a lofted hull, thwarts,
    oars or a stubby mast with its sail furled. Origin: the waterline under its middle,
    +z the bow."""
    secs = 7
    vs, fs = [], []
    ring = []
    for i in range(secs + 1):
        t = i / secs; z = -L / 2 + L * t
        k = math.sin(math.pi * min(1, max(0, (t * .92 + .04)))) ** .7
        # (S2 review, LOOKED at the boathouses' launch: the bow was an open U 0.5 m across, the
        # inner skin drawn 3% shorter, so its planks splayed apart at the stem. The bow closes on
        # its stem line; the stern keeps its breadth and is closed by a transom below)
        if i == secs:
            k = 0.0
        half = B / 2 * k; sheer = Hh + .25 * (abs(t - .5) * 2) ** 2
        pts = [(-half, sheer), (-half * .92, sheer * .45), (-half * .55, .02 - .25 * k), (0, -.32 * k), (half * .55, .02 - .25 * k), (half * .92, sheer * .45), (half, sheer)]
        ring.append([(x, y, z) for x, y in pts])
    n = len(ring[0])
    for r in ring: vs += r
    for i in range(secs):
        for j in range(n - 1):
            a = i * n + j
            fs.append((a, a + 1, a + n + 1, a + n))
    # outer skin (faces out) and inner skin (faces in): each face's expected normal points
    # away from (or toward) the hull's long axis a little above the keel
    def outn(f, sgn):
        c = Vector((0, 0, 0))
        for q in f: c += Vector(vs[q])
        c /= len(f)
        return Vector((c.x, (c.y - Hh * .6) * .6, 0)).normalized() * sgn
    mesh(nm('hull'), vs, fs, 'Timber', normals2=[outn(f, 1) for f in fs])
    vi = [(x * .94, y + .02, z * .97) for x, y, z in vs]
    mesh(nm('hulli'), vi, fs, 'TimberD', normals2=[outn(f, -1) for f in fs])
    # the transom: the stern ring closed, and its gap to the inner skin's shorter stern
    mesh(nm('trn'), ring[0], [tuple(range(n))], 'Timber', facing=(0, 0, -1))
    box(nm('stem'), -.05, .05, -.3, Hh + .3, L / 2 - .1, L / 2 + .04, 'S_oak')
    for i in range(1, secs):
        if i % 2: continue
        z = -L / 2 + L * i / secs
        half = B / 2 * math.sin(math.pi * (i / secs * .92 + .04)) ** .7 * .9
        box(nm('th'), -half, half, Hh * .55, Hh * .55 + .05, z - .12, z + .12, 'S_oak')
    if mast:
        box(nm('ms'), -.07, .07, 0, 3.4, L * .12 - .07, L * .12 + .07, 'S_oak')
        box(nm('yd'), -1.2, 1.2, 2.9, 3.0, L * .12 - .05, L * .12 + .05, 'S_oak')
        box(nm('sl'), -1.1, 1.1, 2.7, 2.95, L * .12 - .12, L * .12 + .12, 'S_sail')
    else:
        for s in (-1, 1):
            with G.at(M=T(s * B * .45, Hh, 0) @ RY(s * .2)):
                box(nm('oar'), -.03, .03, -.03, .03, -1.6, 1.6, 'S_oak')


def boat_skiff(): boat(4.4, 1.5, .55)


def boat_launch(): boat(7.2, 2.2, .8, mast=True)


# ====================================================================== S1 (MM-13, MM-14): fountains and stalls
def _crescent(cx, cy, r, z, surf, facing=1, th=.0, rot=0.0):
    """A crescent moon (the academy's device) as a flat plate in the plane z facing +z
    (facing=-1: -z), or a slab `th` thick: an outer circle less an offset inner one."""
    pts = []
    for j in range(13):
        t = -math.pi / 2 + math.pi * j / 12 + rot
        pts.append((cx + math.cos(t) * r, cy + math.sin(t) * r))
    for j in range(12, -1, -1):
        t = -math.pi / 2 + math.pi * j / 12 + rot
        pts.append((cx + math.cos(t) * r * .78 - math.cos(rot) * r * .32, cy + math.sin(t) * r * .78 - math.sin(rot) * r * .32))
    if th > 0:
        prism(nm('cres'), pts, z, z + th * facing if facing > 0 else z - th, surf)
    else:
        mesh(nm('cres'), [(x, y, z) for x, y in pts], [tuple(range(len(pts)))], surf, facing=(0, 0, facing))


def _stream(x, y0, z0, y1, z1, w=.11):
    """A thin fall of water from a spout to a basin: two crossed strips, both sides, in the
    lime-white of broken water (LOOKED: in the basins' dark teal a fall read as a pole)."""
    for dx, dz, n_ in ((w / 2, 0, (0, 0, 1)), (0, w / 2, (1, 0, 0))):
        P = [(x - dx, y1, z1 - dz), (x + dx, y1, z1 + dz), (x + dx, y0, z0 + dz), (x - dx, y0, z0 - dz)]
        mesh(nm('fall'), P, [(0, 1, 2, 3)], 'S_lime_s', facing=n_)
        mesh(nm('fallb'), P[::-1], [(0, 1, 2, 3)], 'S_lime_s', facing=tuple(-v for v in n_))


def _sheet(name, P, W, S, surf='S_fall'):
    """A double-sided ribbon of water: centre points P, widths W, side unit vectors S (one
    each), each face's normal the cross of its side and its run."""
    vs, fs, n2 = [], [], []
    for i in range(len(P) - 1):
        a, b = Vector(P[i]), Vector(P[i + 1])
        sa, sb = Vector(S[i]) * (W[i] / 2), Vector(S[i + 1]) * (W[i + 1] / 2)
        q = [a - sa, a + sa, b + sb, b - sb]
        n = (Vector(S[i]).cross(b - a)).normalized()
        k = len(vs); vs.extend([tuple(v) for v in q]); fs.append((k, k + 1, k + 2, k + 3)); n2.append(n)
        k = len(vs); vs.extend([tuple(v) for v in q[::-1]]); fs.append((k, k + 1, k + 2, k + 3)); n2.append(-n)
    mesh(name, vs, fs, surf, normals2=n2)


def _arc(p0, p1, n=8):
    """A fall of water from p0 to p1 as it falls: leaving p0 level, its run along the ground
    even in time, its drop growing as the square (a parabola), so it curls over and down."""
    return [(p0[0] + (p1[0] - p0[0]) * t, p0[1] - (p0[1] - p1[1]) * t * t, p0[2] + (p1[2] - p0[2]) * t)
            for t in (j / n for j in range(n + 1))]


def _jet(p0, p1, w0, w1, n=8, surf='S_fall'):
    """S1 review: a spout's jet, not a post -- a short parabolic arc from the spout's lip into
    its basin, thinning as it falls, as two crossed ribbons so it reads from any side."""
    P = _arc(p0, p1, n)
    W = [w0 + (w1 - w0) * (j / n) for j in range(n + 1)]
    d = Vector((p1[0] - p0[0], 0, p1[2] - p0[2]))
    side = Vector((-d.z, 0, d.x)).normalized() if d.length > 1e-6 else Vector((1, 0, 0))
    _sheet(nm('jet'), P, W, [tuple(side)] * len(P), surf)
    S2 = []
    for j in range(n + 1):
        a, b = Vector(P[max(0, j - 1)]), Vector(P[min(n, j + 1)])
        S2.append(tuple(side.cross(b - a).normalized()))
    _sheet(nm('jet2'), P, [w * .8 for w in W], S2, surf)


def _splash(x, y, z, r0=.1, r1=.3, k=7, surf='S_fall'):
    """Where a fall meets its basin: a ragged ring of broken water just over the surface."""
    vs, fs = [], []
    for j in range(k):
        a = 2 * math.pi * j / k
        ro = r1 * (1.0 if j % 2 else .72)
        vs += [(x + math.cos(a) * r0, y, z + math.sin(a) * r0), (x + math.cos(a) * ro, y + .02, z + math.sin(a) * ro)]
    for j in range(k):
        i0, i1 = 2 * j, 2 * ((j + 1) % k)
        fs.append((i0, i1, i1 + 1, i0 + 1))
    mesh(nm('spl'), vs, fs, surf, facing=(0, 1, 0))


def _half_basin(R, y0, rim, cz=0.0, cy=0.0, seg=12):
    """A semicircular basin against a wall (the +z half round (0, cy, cz)): a pale moulded
    rim on a basalt foot, its water at rim - 0.12."""
    lathe(nm('hbf'), [(R + .08, y0 - .3, True), (R + .08, y0 + .12, True), (R - .02, y0 + .12, False)], 'Basalt', seg=seg, cy=cy, cz=cz,
          a0=0, a1=math.pi, caps=False, smooth=False)
    lathe(nm('hbr'), [(R, y0 + .12, True), (R, rim - .12, True), (R + .1, rim - .08, True), (R + .1, rim, True), (R - .2, rim, True),
                      (R - .2, rim - .22, False)], 'Pale', seg=seg, cy=cy, cz=cz, a0=0, a1=math.pi, caps=False, smooth=False)
    pts = [(0, rim - .12, cz)] + [((R - .2) * math.cos(math.pi * j / seg), rim - .12, cz + (R - .2) * math.sin(math.pi * j / seg)) for j in range(seg, -1, -1)]
    mesh(nm('hbw'), [(x, y + cy, z) for x, y, z in pts], [tuple(range(len(pts)))], 'S_water', facing=(0, 1, 0))


def mere_fountain():
    """MM-13 (Philip, 2026-10-07: "a fountain or carved niche facing the axis where the blank
    basalt box stands"). THE MOON FOUNTAIN: the bastion between the Mere Stair's two side
    flights, where the stair splits round it. Origin: on the axis at the crossing's level
    (7.2) on the bastion's SOUTH face; +z north, up the stair. The bastion is x +-2.6 (the
    side flights' inner cheeks stand against it), z 0..7.5, its top the terrace's 10.8
    (y 3.6).
      * NORTH, on the terrace, facing the head and the court: an AEDICULE -- two pale
        columns, a banded entablature and a pediment crowned by the academy's brass crescent,
        round a round-headed niche of basalt and lime with a pale crescent moon in it and a
        mask spouting into a semicircular basin on the terrace.
      * SOUTH, facing the crossing and the harbour: the bastion's banded face, a lower niche
        with a conch of pale and basalt rays and a spout into a basin on the crossing.
      * its top, between the aedicule and the south parapet: a paved platform behind a coped
        parapet, where two lemons stand in tubs (pieces of their own)."""
    hw, dep, ty = 2.6, 7.5, 3.6
    za = dep - 1.2                       # the aedicule's back face
    # ---- the south face (built in a frame turned pi: local +z is the crossing's side)
    with G.at(M=RY(math.pi)):
        Hn = hole(-1.15, 1.15, .72, 2.15, 1.15, 12)
        wall(-hw, hw, -.3, .6, 'Basalt')
        wall(-hw, hw, .6, ty + .9, 'Tufa', [Hn])
        voussoirs(Hn, .34, .06, -.22, n=11)
        reveal(Hn, 0, .85, 'BasaltS', head_from=-.22)
        infill(Hn, -.85, 'Lime')
        if not far():
            # the conch: rays of pale and basalt fanning in the niche's head
            cy_, r_ = Hn['ys'], 1.13
            for k in range(9):
                a0_ = math.pi * k / 9; a1_ = math.pi * (k + 1) / 9
                P = [(0, cy_), (r_ * math.cos(a0_), cy_ + r_ * math.sin(a0_)), (r_ * math.cos(a1_), cy_ + r_ * math.sin(a1_))]
                mesh(nm('conch'), [(x, y, -.82) for x, y in P], [(0, 1, 2)], 'Pale' if k % 2 else 'Basalt', facing=(0, 0, 1))
            # the spout: a bronze boss with a short lip, the water falling from it
            lathe(nm('mask'), [(0, -.02, False), (.13, -.02, True), (.14, .05, True), (.08, .1, True), (0, .11, False)], 'S_brass_p', seg=8,
                  M=T(0, 1.5, -.84) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            # S1 review: the niche below the conch was a flat pale panel with a white rod in it. Now
            # FLUTED -- the conch's rays carried down as five pale flutes on the lime -- with a
            # pale MOON MASK, a basalt ring round a pale disc, the spout in its mouth; and the
            # water a jet arcing out into the basin, not a post (a ring of broken water where it lands)
            for j in range(5):
                x_ = -.84 + j * .42
                pbox(nm('flt'), x_ - .07, x_ + .07, .78, cy_ - .04, -.85, -.8, 'Pale', keep=(0, 1, 3, 4))
            lathe(nm('mring'), [(.36, -.02, True), (.36, .05, True), (.28, .05, True)], 'Basalt', seg=12,
                  M=T(0, 1.5, -.82) @ Matrix.Rotation(math.pi / 2, 4, 'X'), caps=False, smooth=False)
            lathe(nm('mdisc'), [(0, .03, False), (.29, .03, True), (.29, .05, True), (0, .07, False)], 'Pale', seg=12,
                  M=T(0, 1.5, -.82) @ Matrix.Rotation(math.pi / 2, 4, 'X'), smooth=False)
            prism(nm('spt'), [(0, 1.5), (.36, 1.44), (.36, 1.38), (0, 1.42)], -.05, .05, 'S_brass_p', axis='x', M=T(0, 0, -.74))
            _jet((0, 1.41, -.4), (0, .52, .42), .15, .07, 8)
            _splash(0, .52, .42, .05, .26, 7)
        _half_basin(1.55, 0, .62, cz=0.0)
        # pale pilasters at the corners, a pale cornice at the terrace's level, the parapet's coping
        for s in (-1, 1):
            pbox(nm('pil'), s * hw - (.42 if s > 0 else 0), s * hw + (0 if s > 0 else .42), .6, ty - .2, 0, .07, 'Pale', lean='front')
        band(ty - .25, .25, 'Pale', x0=-hw, x1=hw, proud=.1)
        band(1.0, .14, 'Basalt', x0=-hw, x1=-1.45); band(1.0, .14, 'Basalt', x0=1.45, x1=hw)
    # ---- the two sides (x +-hw), up to the parapet, and the aedicule's flanks above it
    for s in (-1, 1):
        with G.at(M=T(s * hw, 0, dep / 2) @ RY(s * math.pi / 2)):
            # local x runs along z (from -dep/2 to dep/2, mirrored per side)
            wall(-dep / 2, dep / 2, -.3, ty + .9, 'Tufa')
            band(ty - .25, .25, 'Pale', x0=-dep / 2, x1=dep / 2, proud=.1)
            band(1.0, .14, 'Basalt', x0=-dep / 2, x1=dep / 2)
            xs = (-dep / 2, -dep / 2 + 1.2) if s > 0 else (dep / 2 - 1.2, dep / 2)
            wall(xs[0], xs[1], ty + .9, ty + 3.0, 'Tufa')
    # ---- the top: paved, behind a parapet on its south and sides
    quad(nm('top'), [(-hw + .35, ty, .35), (hw - .35, ty, .35), (hw - .35, ty, za), (-hw + .35, ty, za)], 'S_pale_s', (0, 1, 0))
    for (x0, x1, z0, z1, n_) in ((-hw, hw, -.07, .35, (0, 0, 1)), (-hw, -hw + .35, .35, za, (1, 0, 0)), (hw - .35, hw, .35, za, (-1, 0, 0))):
        box(nm('cop'), x0 - .04, x1 + .04, ty + .9, ty + 1.02, z0 - .04, z1, 'Pale')
    quad(nm('pin'), [(hw - .35, ty, .35), (-hw + .35, ty, .35), (-hw + .35, ty + .9, .35), (hw - .35, ty + .9, .35)], 'Tufa', (0, 0, 1))
    for s in (-1, 1):
        x = s * (hw - .35)
        quad(nm('pin'), [(x, ty, za if s < 0 else .35), (x, ty, .35 if s < 0 else za), (x, ty + .9, .35 if s < 0 else za), (x, ty + .9, za if s < 0 else .35)],
             'Tufa', (-s, 0, 0))
    # ---- the aedicule's back (z za, facing south over the platform): a blind panel
    with G.at(M=T(0, 0, za) @ RY(math.pi)):
        wall(-hw, hw, ty, ty + 3.0, 'Tufa')
        if not far():
            pbox(nm('bp'), -1.4, 1.4, ty + .9, ty + 2.6, 0, .05, 'Lime', keep=(4,))
            for y in (ty + .85, ty + 2.6):
                pbox(nm('bpf'), -1.5, 1.5, y, y + .1, 0, .08, 'Pale', keep=(2, 3, 4))
            _crescent(0, ty + 1.75, .42, .06, 'S_brass_p')
    # ---- the aedicule's front (z dep, facing the terrace and the head)
    Hu = hole(-1.0, 1.0, ty + .78, ty + 2.0, 1.0, 12)
    wall(-hw, hw, ty - .3, ty + 3.0, 'Tufa', [Hu], z=dep)
    voussoirs(dict(Hu), .3, dep + .05, dep - .2, n=11)
    reveal(Hu, dep, .7, 'BasaltS', head_from=dep - .2)
    infill(Hu, dep - .7, 'S_blue')
    if not far():
        _crescent(0, ty + 2.05, .48, dep - .69, 'S_pale_s', th=.12)
        lathe(nm('umask'), [(0, -.02, False), (.12, -.02, True), (.13, .05, True), (.07, .09, True), (0, .1, False)], 'S_brass_p', seg=8,
              M=T(0, ty + 1.25, dep - .69) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        prism(nm('uspt'), [(0, ty + 1.25), (.34, ty + 1.19), (.34, ty + 1.13), (0, ty + 1.17)], -.05, .05, 'S_brass_p', axis='x', M=T(0, 0, dep - .6))
        _jet((0, ty + 1.16, dep - .27), (0, ty + .52, dep + .5), .15, .07, 8)
        _splash(0, ty + .52, dep + .5, .05, .26, 7)
    # the columns: pale shafts on pedestals, banded basalt capitals
    for s in (-1, 1):
        x = s * 2.2
        box(nm('ped'), x - .38, x + .38, ty - .02, ty + .62, dep - .02, dep + .62, 'Pale')
        lathe(nm('col'), [(.25, ty + .62, True), (.25, ty + .74, True), (.2, ty + .8, True), (.17, ty + 2.62, True), (.22, ty + 2.66, True),
                          (.3, ty + 2.8, True), (0, ty + 2.8, False)], 'Pale', seg=10, cx=x, cz=dep + .3)
        box(nm('cap'), x - .34, x + .34, ty + 2.8, ty + 2.92, dep - .04, dep + .64, 'Basalt')
    # the entablature, its banded frieze, and the pediment with its brass crescent
    box(nm('arch'), -hw - .1, hw + .1, ty + 2.92, ty + 3.12, za - .05, dep + .7, 'Pale')
    box(nm('frz'), -hw - .05, hw + .05, ty + 3.12, ty + 3.42, za, dep + .62, 'Basalt')
    box(nm('corn'), -hw - .18, hw + .18, ty + 3.42, ty + 3.58, za - .1, dep + .78, 'Pale')
    prism(nm('ped'), [(-hw - .1, ty + 3.58), (hw + .1, ty + 3.58), (0, ty + 4.5)], za - .05, dep + .65, 'Tufa')
    # the raking cornices: a pale slab along each rake (wound so its outside faces out)
    for sx in (-1, 1):
        a_, b_ = (sx * (hw + .24), ty + 3.55), (0, ty + 4.62)
        poly_ = [a_, b_, (0, ty + 4.78), (a_[0], a_[1] + .16)]
        prism(nm('pco'), poly_ if sx > 0 else poly_[::-1], za - .12, dep + .82, 'Pale')
    if not far():
        lathe(nm('pfin'), [(.12, ty + 4.5, True), (.12, ty + 4.7, True), (0, ty + 4.78, False)], 'Pale', seg=8, cz=(za + dep) / 2)
        _crescent(0, ty + 5.2, .42, (za + dep) / 2 - .03, 'S_brass_p', th=.06)
    # the upper basin, on the terrace before the aedicule, between the columns
    _half_basin(1.6, ty, ty + .62, cz=dep)


def court_fountain():
    """MM-14 (Philip, 2026-10-07: "keep [Academy Court's] size and FILL it: fountain, market
    stalls, lemon grove, benches"). THE COURT FOUNTAIN, the east half's centre: an
    octagonal basin 6.2 m across -- a basalt step, a pale moulded rim, a band of basalt
    set with pale crescents (the moon ring of the crystal's dais, carried on) -- and in it a
    banded pedestal carrying a broad pale tazza that spills in eight streams, a second small
    tazza, and the academy's brass crescent over all. Origin: the centre on the court."""
    ph = math.pi / 8
    lathe(nm('cs'), [(3.4, -.2, True), (3.4, .1, True), (3.12, .1, False)], 'Basalt', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('cr'), [(3.1, .1, True), (3.1, .48, True), (3.2, .52, True), (3.2, .64, True), (2.78, .64, True), (2.78, .42, False)], 'Pale', seg=8,
          phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('cb'), [(3.12, .22, True), (3.12, .36, True)], 'Basalt', seg=8, phase=ph, caps=False, smooth=False, urep=8)
    lathe(nm('cw'), [(2.8, .48, False), (0, .48, False)], 'S_water', seg=8, phase=ph, caps=False, smooth=False)
    if not far():
        for k in range(8):
            a = k * math.pi / 4
            r_ = 3.12 * math.cos(math.pi / 8) + .012     # on the octagon's faces, not its corners
            with G.at(M=T(math.cos(a) * r_, .29, math.sin(a) * r_) @ RY(math.pi / 2 - a)):
                _crescent(0, 0, .11, 0, 'S_pale_s')
    # the pedestal, banded, and the great tazza
    lathe(nm('pd'), [(.62, .4, True), (.62, .62, True), (.5, .7, True), (.42, .78, True), (.36, 1.45, True), (.5, 1.55, True), (.3, 1.62, False)],
          'Pale', seg=10)
    lathe(nm('pdb'), [(.4, 1.0, True), (.4, 1.14, True)], 'Basalt', seg=10, caps=False)
    lathe(nm('tz'), [(.3, 1.55, True), (1.2, 1.78, True), (1.5, 1.86, True), (1.56, 1.95, True), (1.46, 1.98, True), (1.25, 1.9, False)], 'Pale', seg=16)
    lathe(nm('tzw'), [(1.4, 1.9, False), (0, 1.9, False)], 'S_water', seg=16, caps=False)
    # THE EIGHT JETS (S1 review: eight falls, as crossed straight strips and then as broad curved
    # sheets, read as a cage of pale legs under the tazza at 5-10 m; one bell of water all round
    # read as a frosted dome -- LOOKED, three times): eight brass spouts on the lip, each throwing
    # a thin arc of water out and down into the basin a metre beyond the tazza, as a jet does --
    # thin, cool white, curling over -- and a ring of broken water where it lands
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        c, s_ = math.cos(a), math.sin(a)
        lathe(nm('spo'), [(0, -.02, False), (.07, -.02, True), (.07, .14, True), (.045, .2, True), (0, .2, False)], 'S_brass_p', seg=5,
              M=T(c * 1.5, 1.9, s_ * 1.5) @ RY(math.pi / 2 - a) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        _jet((c * 1.68, 1.9, s_ * 1.68), (c * 2.5, .5, s_ * 2.5), .12, .06, 6)
        if not far():
            _splash(c * 2.5, .5, s_ * 2.5, .05, .26, 6)
    # the upper shaft, the small tazza, the crescent
    lathe(nm('us'), [(.22, 1.9, True), (.22, 2.0, True), (.15, 2.1, True), (.13, 2.75, True), (.2, 2.82, False)], 'Pale', seg=8)
    lathe(nm('ut'), [(.15, 2.8, True), (.62, 2.95, True), (.68, 3.04, True), (.58, 3.06, False)], 'Pale', seg=12)
    lathe(nm('utw'), [(.6, 3.0, False), (0, 3.0, False)], 'S_water', seg=12, caps=False)
    lathe(nm('ub'), [(0, 3.0, False), (.1, 3.02, True), (.1, 3.35, True), (.16, 3.4, True), (0, 3.48, False)], 'S_brass_p', seg=8)
    _crescent(0, 3.85, .4, -.04, 'S_brass_p', th=.08)


def _stall(kind):
    """MM-14: A MARKET STALL on Academy Court (the court's market: scholars' goods, the
    island's fruit). A walnut booth 2.8 wide and 1.7 deep -- four posts, a counter, a back
    rack and a boarded monopitch roof with a plain linen valance (MM-1: no striped awnings).
    Origin: the counter's front centre on the ground, +z the customer's side.
    'a': books and scrolls -- stacked volumes, rolled charts, an inkstand, a rack of spines;
    'b': the island's lemons and the herb garden's jars -- crates heaped with fruit, jars,
    a basket, bunches hanging from the beam."""
    import random as _r
    rng = _r.Random(71 if kind == 'a' else 72)
    # S1 review (the row read as one stall four times): the two differ by SILHOUETTE, not only
    # their goods -- 'a' a narrow deep booth under a boarded monopitch; 'b' a broad shallow one
    # under a pitched linen canopy on a ridge pole, taller, its gables open
    hw, zb = (1.4, -1.7) if kind == 'a' else (1.65, -1.3)
    if kind == 'a':
        for x in (-hw + .06, hw - .06):
            obox(nm('ps'), x - .06, x + .06, 0, 2.62, -.06, .06, 'S_oak', omit=('-y',))
            obox(nm('pb'), x - .06, x + .06, 0, 2.2, zb - .06, zb + .06, 'S_oak', omit=('-y',))
            box(nm('rl'), x - .05, x + .05, 2.0, 2.08, zb, 0, 'S_oak')
        # the roof: boards falling to the back, their underside darker, a fascia
        p = (2.62 - 2.22) / 1.9
        quad(nm('rf'), [(-hw - .15, 2.72, .25), (hw + .15, 2.72, .25), (hw + .15, 2.72 - p * 2.2, zb - .25), (-hw - .15, 2.72 - p * 2.2, zb - .25)], 'Timber', (0, 1, p))
        quad(nm('ru'), [(hw + .15, 2.68, .25), (-hw - .15, 2.68, .25), (-hw - .15, 2.68 - p * 2.2, zb - .25), (hw + .15, 2.68 - p * 2.2, zb - .25)], 'TimberD', (0, -1, -p))
        box(nm('rfa'), -hw - .15, hw + .15, 2.56, 2.74, .2, .27, 'Timber')
        box(nm('rfb'), -hw - .15, hw + .15, 2.62 - p * 2.2 - .12, 2.74 - p * 2.2, zb - .27, zb - .2, 'Timber')
        # the valance: plain linen, hanging in three swags
        for k in range(3):
            xa, xb = -hw - .1 + k * (2 * hw + .2) / 3, -hw - .1 + (k + 1) * (2 * hw + .2) / 3
            P = [(xa, 2.58, .28), (xb, 2.58, .28), (xb, 2.36, .28), ((xa + xb) / 2, 2.26, .28), (xa, 2.36, .28)]
            mesh(nm('val'), P, [tuple(range(5))], 'S_sail', facing=(0, 0, 1))
            mesh(nm('valb'), P[::-1], [tuple(range(5))], 'S_sail', facing=(0, 0, -1))
    else:
        ye, yr, zr = 2.5, 3.3, zb / 2
        for x in (-hw + .06, hw - .06):
            for z_ in (0.0, zb):
                obox(nm('ps'), x - .06, x + .06, 0, ye, z_ - .06, z_ + .06, 'S_oak', omit=('-y',))
            # the gable's king post and the tie beam across it
            obox(nm('kp'), x - .05, x + .05, ye, yr, zr - .05, zr + .05, 'S_oak', omit=('-y',))
            box(nm('tb'), x - .05, x + .05, ye - .1, ye, zb - .06, .06, 'S_oak')
        box(nm('rp'), -hw - .25, hw + .25, yr - .06, yr + .04, zr - .05, zr + .05, 'S_oak')
        for z_ in (0.0, zb):
            box(nm('eb'), -hw, hw, ye - .1, ye, z_ - .05, z_ + .05, 'S_oak')
        # the canopy: two linen slopes off the ridge, out past the posts both ways, both sides
        for z0_, z1_ in ((zr, .45), (zr, zb - .45)):
            yo = ye - .12
            P = [(-hw - .3, yr + .02, z0_), (hw + .3, yr + .02, z0_), (hw + .3, yo, z1_), (-hw - .3, yo, z1_)]
            up = Vector((0, abs(z1_ - z0_), (yr - yo) * (1 if z1_ > z0_ else -1))).normalized()
            mesh(nm('cnv'), P, [(0, 1, 2, 3)], 'S_sail', facing=tuple(up))
            mesh(nm('cnvb'), P[::-1], [(0, 1, 2, 3)], 'S_sail', facing=tuple(-up))
        # a scalloped linen valance along the front eave, five small swags
        for k in range(5):
            xa, xb = -hw - .3 + k * (2 * hw + .6) / 5, -hw - .3 + (k + 1) * (2 * hw + .6) / 5
            P = [(xa, ye - .12, .46), (xb, ye - .12, .46), (xb, ye - .3, .46), ((xa + xb) / 2, ye - .42, .46), (xa, ye - .3, .46)]
            mesh(nm('val'), P, [tuple(range(5))], 'S_sail', facing=(0, 0, 1))
            mesh(nm('valb'), P[::-1], [tuple(range(5))], 'S_sail', facing=(0, 0, -1))
    # the counter: a top on a boarded front, its ends; the back rack
    box(nm('ct'), -hw + .02, hw - .02, .86, .94, -.45, .14, 'S_oak')
    obox(nm('cf'), -hw + .08, hw - .08, 0, .86, .02, .1, 'Timber', omit=('-y',))
    for x in (-hw + .08, hw - .08):
        obox(nm('ce'), x - .04, x + .04, 0, .86, -.42, .1, 'Timber', omit=('-y',))
    obox(nm('bk'), -hw + .06, hw - .06, 0, 2.0, zb - .04, zb + .04, 'Timber', omit=('-y',))
    for y in (.9, 1.45):
        box(nm('sh'), -hw + .1, hw - .1, y, y + .05, zb + .04, zb + .4, 'S_oak')
    if kind == 'a':
        # the rack of spines, the volumes stacked on the counter, rolled charts, an inkstand
        for y in (.95, 1.5):
            quad(nm('spn'), [(-hw + .15, y, zb + .3), (hw - .15, y, zb + .3), (hw - .15, y + .4, zb + .3), (-hw + .15, y + .4, zb + .3)], 'R_books', (0, 0, 1))
        for k in range(5):
            x = -1.05 + k * .48 + rng.uniform(-.05, .05); h = .94
            for j in range(rng.randint(1, 3)):
                w_, d_, t_ = rng.uniform(.18, .26), rng.uniform(.24, .32), rng.uniform(.05, .08)
                c = rng.choice(('S_red', 'S_blue', 'S_oak', 'S_shutgreen', 'S_hull'))
                box(nm('bkv'), x - w_ / 2, x + w_ / 2, h, h + t_, -.25 - d_ / 2, -.25 + d_ / 2, c)
                h += t_
        for k in range(3):
            lathe(nm('scr'), [(.045, -.22, True), (.045, .22, True)], 'S_sail', seg=6, caps=True,
                  M=T(.55 + k * .1, .99, -.05 - k * .07) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
        lathe(nm('ink'), [(0, .94, False), (.06, .94, True), (.06, 1.0, True), (.03, 1.04, False)], 'S_hull', seg=6, cx=-.3, cz=-.05)
        box(nm('quill'), -.29, -.27, 1.0, 1.22, -.06, -.04, 'S_sail')
    else:
        # crates of lemons, jars, a basket; bunches of herbs from the roof's rail
        for k, (x, z) in enumerate(((-.85, -.2), (-.25, -.25), (.4, -.2))):
            box(nm('cr'), x - .27, x + .27, .94, 1.1, z - .2, z + .2, 'S_oak')
            quad(nm('lm'), [(x - .25, 1.09, z + .18), (x + .25, 1.09, z + .18), (x + .25, 1.09, z - .18), (x - .25, 1.09, z - .18)], 'S_lemon', (0, 1, 0))
            for j in range(3):
                lathe(nm('lmn'), [(0, -.05, False), (.05, 0, False), (0, .055, False)], 'S_lemon', seg=5,
                      cx=x + rng.uniform(-.18, .18), cy=1.13 + rng.uniform(0, .04), cz=z + rng.uniform(-.13, .13), caps=False)
        for k, x in enumerate((.95, 1.12)):
            lathe(nm('jar'), [(0, .94, False), (.08, .95, True), (.11, 1.08, True), (.07, 1.22, True), (.08, 1.26, True), (0, 1.26, False)],
                  'S_cotta', seg=7, cx=x, cz=-.15 - k * .14)
        for k in range(4):
            x = -1.0 + k * .62
            lathe(nm('pot'), [(0, .95, False), (.09, .95, True), (.11, 1.1, True), (0, 1.1, False)], 'S_cotta', seg=6, cx=x, cy=0.0, cz=zb + .22)
            lathe(nm('pot2'), [(0, 1.5, False), (.09, 1.5, True), (.11, 1.65, True), (0, 1.65, False)], 'S_cotta' if k % 2 else 'S_lime_s', seg=6, cx=x + .3, cz=zb + .22)
        for x in (-.9, -.3, .3, .9):
            box(nm('hb'), x - .015, x + .015, 1.75, 2.4, -.01, .01, 'S_rope')
            prism(nm('hbn'), [(x - .1, 1.75), (x + .1, 1.75), (x + .04, 1.45), (x - .04, 1.45)], -.03, .03, 'S_leafg')


def wall_arcade():
    """S1 review (MM-13; "S1 traded the old plain parapet for large blank tufa walls on the main
    axis"): ONE BAY OF BLIND ARCADING for the Mere Stair's terrace walls, the city's own
    vocabulary carried onto the stair's masonry -- a round-headed blind arch of pale and basalt
    voussoirs on pale pilasters, a basalt impost band, a lime tympanum with the academy's pale
    crescent, a pale cornice under the wall's coping. A 0.1 m skin laid on a wall's face.
    Origin: the bay's foot centre on the wall's face, +z out of the wall; 2.0 wide, 3.3 high
    (the terrace's walls stand 4.5 over it: the coping and a course stay the wall's)."""
    W, H, z = 1.0, 3.3, .1
    Hb = hole(-.62, .62, .32, 2.2, .62, 10)
    wall(-W, W, 0, H, 'Tufa', [Hb], z=z)
    voussoirs(Hb, .2, z + .04, z - .06, n=9)
    reveal(Hb, z, .08, 'TufaS', head_from=z - .06)
    infill(Hb, z - .08, 'Lime')
    if not far():
        _crescent(0, 2.35, .26, z - .07, 'S_pale_s')
        pbox(nm('sill'), -.7, .7, .26, .34, z - .08, z + .06, 'Pale', keep=(2, 3, 4))
    for sx in (-1, 1):
        x0, x1 = (-W, -W + .26) if sx < 0 else (W - .26, W)
        pbox(nm('pil'), x0, x1, 0, H - .22, z, z + .07, 'Pale', keep=(0, 1, 4))
        pbox(nm('imp'), x0 + (.26 if sx < 0 else -.36), x1 + (.36 if sx < 0 else -.26), 2.12, 2.26, z, z + .05, 'Basalt', keep=(2, 3, 4))
    pbox(nm('cor'), -W - .03, W + .03, H - .22, H, z, z + .12, 'Pale', keep=(2, 3, 4))
    # the skin's own edges, down its two sides
    for x, sgn in ((-W, -1), (W, 1)):
        quad(nm('edge'), [(x, 0, 0), (x, 0, z), (x, H, z), (x, H, 0)], 'Tufa', (sgn, 0, 0))


def market_stall_a(): _stall('a')
def market_stall_b(): _stall('b')


# ====================================================================== S3 review (A-13): the gardens' own trees
def limb(P0, P1, r0, r1, surf='L_bark', seg=5):
    """A tapering woody limb from P0 to P1 (a frustum along the line, open at both ends)."""
    P0, P1 = Vector(P0), Vector(P1)
    d = P1 - P0; L = d.length
    R = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    lathe(nm('trunk'), [(r0, 0, True), (r1, L, False)], surf, seg=seg, caps=False, M=T(*P0) @ R)


def species_crown(C, R, rng, surfs, n_out=30, n_fin=12, n_in=6, size=(.62, .82), up=.35):
    """lemon_crown's alpha cards for any spray: cards over the crown's skin facing out, fins standing
    radially through it, a few large cards inside to close the core. surfs: [(surf, weight)]."""
    C = Vector(C); items = []
    tot = sum(w for _, w in surfs)

    def pick():
        r = rng.uniform(0, tot); acc = 0
        for s_, w in surfs:
            acc += w
            if r <= acc: return s_
        return surfs[-1][0]
    for d in _fib(n_out):
        if d.y < -.62: continue
        P = C + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * rng.uniform(.74, .88)
        nrm = (Vector((d.x / R[0], d.y / R[1], d.z / R[2])).normalized() + Vector((0, up, 0))).normalized()
        items.append((P, nrm, Vector((rng.uniform(-1, 1), 1.2, rng.uniform(-1, 1))), rng.uniform(*size), pick()))
    for d in _fib(n_fin):
        if d.y < -.45: continue
        P = C + Vector((d.x * R[0], d.y * R[1], d.z * R[2])) * .55
        out = Vector((d.x, d.y * .6 + .25, d.z)).normalized()
        nrm = out.cross(Vector((0, 1, 0)) if abs(out.y) < .9 else Vector((1, 0, 0))).normalized()
        items.append((P, nrm, out, rng.uniform(size[0] * 1.05, size[1] * 1.15), pick()))
    for k in range(n_in):
        a = k * 2 * math.pi / max(1, n_in) + rng.uniform(-.3, .3)
        P = C + Vector((math.cos(a) * R[0] * .2, rng.uniform(-.15, .2) * R[1], math.sin(a) * R[2] * .2))
        items.append((P, Vector((math.cos(a + 1.57), 0, math.sin(a + 1.57))), Vector((0, 1, 0)), size[1] * 1.35, surfs[0][0]))
    leaf_cards(items, tuple(C), blend=.72)


def soil_ring(r, seg=9):
    """The planting's own ground: a low disc of dark soil, its rim a hand under the paving's lift."""
    lathe(nm('soil'), [(r, .015, False), (r * .55, .05, False), (0, .06, False)], 'L_soil', seg=seg, caps=False)


def orchard_lemon(var='a'):
    """An ORCHARD lemon (A-13: "86% of the trees are the one lemon_tub ... on mown lawn"): planted in
    the ground, no tub -- a soil ring at its foot, a short trunk branching low into a broad crown, the
    way an orchard tree is kept for picking. 'b' is its fellow: a lower, wider crown thrown to one
    side on a leaning trunk. The orchard plants them with a seeded scale and yaw each."""
    import random as _r
    rng = _r.Random(41 if var == 'a' else 43)
    soil_ring(.8)
    if var == 'a':
        C, R, head = Vector((0, 2.35, 0)), (1.25, .98, 1.2), Vector((0, 1.0, 0))
        limb((0, 0, 0), head, .1, .075)
    else:
        C, R, head = Vector((.42, 2.05, .12)), (1.45, .82, 1.25), Vector((.3, .9, .08))
        limb((0, 0, 0), head, .11, .08)
    for k in range(3):
        a = k * 2.1 + rng.uniform(-.3, .3)
        P1 = C + Vector((math.cos(a) * R[0] * .5, R[1] * .2, math.sin(a) * R[2] * .5))
        limb(head, P1, .065, .03, 'L_twig', seg=4)
    species_crown(C, R, rng, [('L_spray_lemon', .45), ('L_spray', .55)], n_out=40, n_fin=16, n_in=7, size=(.78, 1.02))
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi); h = rng.uniform(-.55, .1)
        dv = Vector((math.cos(a), h, math.sin(a))).normalized()
        P = C + Vector((dv.x * R[0], dv.y * R[1], dv.z * R[2])) * .93
        lathe(nm('lem'), [(0, -.07, False), (.045, -.05, False), (.058, 0, False), (.046, .05, False), (0, .075, False)], 'L_fruit', seg=7,
              cx=P[0], cy=P[1], cz=P[2], caps=False)


def orchard_lemon_a(): orchard_lemon('a')
def orchard_lemon_b(): orchard_lemon('b')


def olive_tree():
    """An OLIVE (A-13: each district its own tree): a short, gnarled trunk leaning, splitting into
    two thick limbs, a broken silver-green crown of three lobes over them; in the ground, a soil ring."""
    import random as _r
    rng = _r.Random(47)
    soil_ring(.9)
    k0 = Vector((.12, .7, -.05)); k1 = Vector((.05, 1.35, .1))
    limb((0, 0, 0), k0, .2, .16); limb(k0, k1, .16, .13)
    lobes = [((-.75, 2.5, .2), (1.0, .7, .9)), ((.85, 2.75, -.25), (1.05, .72, .95)), ((.1, 3.25, .45), (.85, .6, .8))]
    for (c, r_) in lobes:
        limb(k1, (c[0] * .7, c[1] - .45, c[2] * .7), .1, .05, 'L_bark', seg=4)
        species_crown(c, r_, rng, [('L_spray_olive', 1.0)], n_out=20, n_fin=8, n_in=3, size=(.62, .82), up=.25)


def cypress():
    """A CYPRESS (A-13): the dark green column of an Italian garden, 6.5 m, on a short trunk -- dense
    scale-leaf fronds over a dark spindle core so it never reads through; in the ground."""
    import random as _r
    rng = _r.Random(53)
    soil_ring(.65, seg=8)
    limb((0, 0, 0), (0, .9, 0), .12, .1)
    lathe(nm('core'), [(.0, .7, False), (.42, 1.4, False), (.55, 3.0, False), (.42, 4.8, False), (.2, 6.0, False), (0, 6.6, False)],
          'L_leafd', seg=7, caps=False)
    species_crown((0, 3.55, 0), (.78, 2.95, .78), rng, [('L_spray_cypress', 1.0)], n_out=50, n_fin=14, n_in=4, size=(.72, .95), up=.1)


def oleander():
    """An OLEANDER shrub (A-13), several stems from one root in a kerbed pit, lance leaves and pink
    flower heads to 2.3 m: the courts' flowering shrub where the lemon tubs stood."""
    import random as _r
    rng = _r.Random(59)
    soil_ring(.7, seg=8)
    lathe(nm('pit'), [(.78, 0, True), (.78, .16, True), (.66, .16, True), (.66, .02, False)], 'L_tub', seg=8, caps=False, smooth=False)
    for k in range(5):
        a = k * 1.256 + rng.uniform(-.2, .2)
        limb((math.cos(a) * .08, .05, math.sin(a) * .08), (math.cos(a) * .45, 1.15, math.sin(a) * .45), .04, .025, 'L_twig', seg=4)
    for (c, r_) in (((-.25, 1.35, .1), (.7, .62, .65)), ((.35, 1.55, -.15), (.68, .7, .66)), ((0, 1.85, .3), (.6, .5, .55))):
        species_crown(c, r_, rng, [('L_spray_oleander', .7), ('L_spray', .3)], n_out=18, n_fin=7, n_in=3, size=(.55, .74), up=.3)


def herb_bed():
    """4 m of a kitchen-garden BED's planting (A-13, the Long Garden: its "bed of herbs and flowers"
    was troughs standing on setts): two rows of cushions -- lavender and rosemary, geranium and
    daisies -- straight in the ground, for a soil bed between kerbs. Origin: the bed's centre line on
    the ground; x along it (stretch x), 0.9 m wide."""
    import random as _r
    rng = _r.Random(61)
    for row, (z, surf, ry) in enumerate(((-.22, 'X_flowers_b', .36), (.22, 'X_flowers', .28))):
        x = -1.85 + rng.uniform(0, .15)
        while x < 1.85:
            r = rng.uniform(.2, .27)
            items = []
            for i in range(5):
                a = rng.uniform(.2, math.pi - .2); b = rng.uniform(0, 2 * math.pi)
                P = Vector((x + math.cos(b) * r * .6, .03 + math.sin(a) * ry, z + math.sin(b) * r * .6))
                nrm = Vector((math.cos(b) * .7, math.sin(a) * 1.2, math.sin(b) * .7)).normalized()
                items.append((P, nrm, rng.uniform(.15, .21), rng.uniform(0, 6.28), _uvwin(rng, .5), 1.0 if row else 1.3))
            leaf_clusters('hb', items, surf, (x, .05, z), blend=.75)
            x += 2 * r + rng.uniform(.05, .18)


def pier_rail():
    """The Inn Pier's rail (A-13: its colliders stood along both edges with nothing drawn, an invisible
    wall over open water): weathered timber posts every 2 m carrying a top rail and a rope between,
    4 m a module (stretch x), origin on the deck's edge line at the boards' top, +z outward. Posts at
    x +-1 so modules laid end to end keep one spacing; flat oak and hull swatches (no strip to slice)."""
    for x in (-1.0, 1.0):
        box(nm('rp'), x - .07, x + .07, -.45, 1.0, -.07, .07, 'S_hull')
        box(nm('rc'), x - .085, x + .085, 1.0, 1.04, -.085, .085, 'S_oak')
    box(nm('rt'), -2.0, 2.0, .92, 1.0, -.06, .06, 'S_oak')
    for (xa, xb) in ((-2.0, -1.0), (-1.0, 1.0), (1.0, 2.0)):
        # the rope, sagging between posts
        n = 3
        for k in range(n):
            a_, b_ = xa + (xb - xa) * k / n, xa + (xb - xa) * (k + 1) / n
            sag = lambda t: .5 - .08 * math.sin(math.pi * (t - xa) / (xb - xa))
            prism(nm('ro'), [(a_, sag(a_) - .018), (b_, sag(b_) - .018), (b_, sag(b_) + .018), (a_, sag(a_) + .018)], -.018, .018, 'S_rope')


def washing_line_long():
    """A long washing line (A-13: W3's linen was the 4 m line stretched 2.5x, its cloths and stripes
    with it): 10 m between hooks (origin at its middle, at the line's height), sagging in three spans
    on two props, nine cloths at their own sizes, each a single cloth of the two linen rects."""
    import random as _r
    rng = _r.Random(67)
    def ly(x): return -.2 * math.sin(math.pi * min(1.0, ((x + 5) % (10 / 3)) / (10 / 3)))   # three spans, sagging
    xs = [-5 + 10 * k / 24 for k in range(25)]
    for a_, b_ in zip(xs, xs[1:]):
        prism(nm('ln'), [(a_, ly(a_) - .012), (b_, ly(b_) - .012), (b_, ly(b_) + .012), (a_, ly(a_) + .012)], -.012, .012, 'S_rope')
    for xp in (-5 + 10 / 3, -5 + 20 / 3):
        box(nm('prop'), xp - .03, xp + .03, -3.3, .02, -.03, .03, 'S_oak')
    x = -4.75
    while x < 4.5:
        w = rng.uniform(.45, .95); h = rng.uniform(.45, 1.0)
        if x + w > 4.8: break
        if any(abs(x + w / 2 - xp) < w / 2 + .1 for xp in (-5 + 10 / 3, -5 + 20 / 3)):
            x += .3; continue
        surf = 'X_linen' if rng.random() < .5 else 'X_linen_b'
        k = rng.randrange(3)
        y0 = ly(x); y1 = ly(x + w)
        uv = [(k / 3 + .02, 0), ((k + 1) / 3 - .02, 0), ((k + 1) / 3 - .02, 1), (k / 3 + .02, 1)]
        mesh(nm('cl'), [(x, y0 - h, 0), (x + w, y1 - h, 0), (x + w, y1, 0), (x, y0, 0)], [(0, 1, 2, 3)], surf, facing=(0, 0, 1), uvs=[uv])
        mesh(nm('clb'), [(x + w, y1 - h, -.005), (x, y0 - h, -.005), (x, y0, -.005), (x + w, y1, -.005)], [(0, 1, 2, 3)], surf, facing=(0, 0, -1),
             uvs=[[uv[1], uv[0], uv[3], uv[2]]])
        x += w + rng.uniform(.12, .4)


# ====================================================================== the causeway (MM-15)
# Philip, 2026-10-07 (MM-15): "rebuild BOTH causeway ends and the gate in the Cloisters style", in
# original modules -- the one road across the Mere (ruling 13), Moonmere's end and the Shores' end the
# same build, and the same gate at both (cg_shell: the Landing's Causeway Gate stands on the Shores
# too, where the kit gatehouse stood). The walk is scene.ts makeCauseway's and is NOT changed (its
# deck's flat zone x +-4.5 at 0.8, its parapet colliders x 4.4..4.8, its barrier, its landward ramp): these draw it. The deck at 0.8
# stands 2.05 over the sea (-1.25), so the arches are low and broad, springing under the water as a
# Roman causeway's do, and their rings are the city's signature banded voussoirs.
CW = {'w': 4.4, 'o': 4.95, 'L': 4.0, 'par': 1.0, 'bed': -9.0, 'spring': -2.45, 'rise': 1.45, 'span': 2.7}


def cw_bay():
    """THE CAUSEWAY, 8 m of it (MM-15). Origin: the deck's top on its centre line, mid-bay; +z along
    the causeway (the bay is symmetric: either way), x across. The deck walks x +-4.4 in pale flags
    with a basalt kerb along each parapet and a basalt band across it over each pier; the parapets
    stand 4.4..4.95, a metre over the deck, banded, coped in pale stone, a pier every 4 m. Under it,
    one broad arch a bay (5.4 m between 2.6 m piers, springing 0.4 under the sea, its crown 1.0 under
    the deck) through the body's whole width, in pale-and-basalt voussoirs on both faces; the piers'
    cutwaters face both ways. Bays abut end to end: the pier at z -4 is shared (its cutwater is this
    bay's), the ends are never drawn. Under the water the piers are one dark swatch each (what the
    shallows show of them), never the tufa's courses: the strip's 2 m tiles cut a face into rows."""
    w, o, L = CW['w'], CW['o'], CW['L']
    sp, ri, bed, span = CW['spring'], CW['rise'], CW['bed'], CW['span']
    # the deck: flags, kerbs, the band over the pier
    quad(nm('dk'), [(-w, 0, -L), (w, 0, -L), (w, 0, L), (-w, 0, L)], 'Pale', (0, 1, 0))
    for s in (-1, 1):
        obox(nm('kb'), min(s * w, s * (w - .3)), max(s * w, s * (w - .3)), 0, .06, -L, L, 'S_blue', omit=('-y', '-z', '+z'))
    obox(nm('db'), -w, w, 0, .012, -L, -L + .45, 'S_blue', omit=('-y', '-x', '+x'))
    for s in (-1, 1):
        # the parapet's inner face, its band and coping, a pier every 4 m on the deck side
        quad(nm('pi'), [(s * w, 0, -L), (s * w, 0, L), (s * w, CW['par'], L), (s * w, CW['par'], -L)], 'Tufa', (-s, 0, 0))
        # (the coping and the pilasters in the pale swatch, not the strip: a strip's 2 m tiles cut an 8 m
        # coping into sixteen pieces, and the bytes are a contract cap, MOONMERE.md A-14)
        obox(nm('pc'), min(s * (w - .06), s * (o + .06)), max(s * (w - .06), s * (o + .06)), CW['par'], CW['par'] + .14, -L, L, 'S_pale_s', omit=('-z', '+z'))
        obox(nm('pb'), min(s * w, s * (w - .03)), max(s * w, s * (w - .03)), .34, .5, -L, L, 'S_blue', omit=('-z', '+z'))
        for zp in (-L, 0.0):
            obox(nm('pp'), min(s * w, s * (w - .1)), max(s * w, s * (w - .1)), 0, CW['par'], zp, zp + .5, 'S_pale_s', omit=('-y', '+y', '+x' if s > 0 else '-x'))
        # the body's face: the wall from the arch's springing to the coping, the arch through it
        with G.at(M=T(s * o, 0, 0) @ RY(s * math.pi / 2)):
            Ha = hole(-span, span, sp, sp, ri, 10)
            wall(-L, L, sp, CW['par'], 'Tufa', [Ha])
            voussoirs(Ha, .5, .1, -.7, n=7)
            for xa, xb in ((-L, -span), (span, L)):
                quad(nm('uw'), [(xa, bed, 0), (xb, bed, 0), (xb, sp, 0), (xa, sp, 0)], 'S_shade', (0, 0, 1))
            if s > 0:
                # the arch's barrel through the body; under it the piers' inner faces, dark
                reveal(dict(Ha, c=sp), -.7, 2 * o - 1.4, 'BasaltS', sill=False, jambs=False)
                for x in (-span, span):
                    quad(nm('uj'), [(x, bed, 0), (x, bed, -2 * o), (x, sp, -2 * o), (x, sp, 0)], 'S_shade', (-x, 0, 0))
            # the string course under the deck, the whole bay long, over the arches' keys (S4, LOOKED:
            # short lengths of it between the arches read as stray dashes on the spandrels)
            pbox(nm('sc'), -L, L, -.32, -.12, 0, .07, 'Basalt', lean='front_top')
    # the cutwaters, both faces, on the shared pier at z -4: a pointed prow up past the sea's level
    # under a pale weathered cap (below the water, the pier's dark swatch)
    for s in (-1, 1):
        P = [(s * o, sp - .8, -L - 1.3), (s * (o + 1.2), sp - .8, -L), (s * o, sp - .8, -L + 1.3),
             (s * o, sp + .5, -L - 1.3), (s * (o + 1.2), sp + .5, -L), (s * o, sp + .5, -L + 1.3)]
        mesh(nm('cwt'), P, [(0, 1, 4, 3), (1, 2, 5, 4)], 'S_shade', facing=(s, 0, 0))
        mesh(nm('cwc'), [P[3], P[4], P[5], (s * o, sp + 1.3, -L)], [(0, 1, 3), (1, 2, 3)], 'S_pale_s', facing=(s, 1, 0))



def cw_abut():
    """THE CAUSEWAY'S SOLID BAY (S4 review): where the strand still stands over an arch's springing,
    an arch sank into the sand -- its ring cut off, a dark void diving under the beach, at both land
    ends (LOOKED from the strand) -- so the road leaves the land on a solid abutment and the arches
    begin where the ground has fallen into the water; and the run's sea end is one too, a whole
    pier-head instead of a cut section in open water. cw_bay's deck, kerbs, banded and coped
    parapets, pilasters and string course over an unpierced body, its -z end CLOSED (the closed end
    faces the land at a land end, the sea at the sea end). Origin as cw_bay's."""
    w, o, L = CW['w'], CW['o'], CW['L']
    sp, bed = CW['spring'], CW['bed']
    quad(nm('dk'), [(-w, 0, -L), (w, 0, -L), (w, 0, L), (-w, 0, L)], 'Pale', (0, 1, 0))
    for s in (-1, 1):
        obox(nm('kb'), min(s * w, s * (w - .3)), max(s * w, s * (w - .3)), 0, .06, -L, L, 'S_blue', omit=('-y', '+z'))
    obox(nm('db'), -w, w, 0, .012, -L, -L + .45, 'S_blue', omit=('-y', '-x', '+x'))
    for s in (-1, 1):
        quad(nm('pi'), [(s * w, 0, -L), (s * w, 0, L), (s * w, CW['par'], L), (s * w, CW['par'], -L)], 'Tufa', (-s, 0, 0))
        obox(nm('pc'), min(s * (w - .06), s * (o + .06)), max(s * (w - .06), s * (o + .06)), CW['par'], CW['par'] + .14, -L, L, 'S_pale_s', omit=('+z',))
        obox(nm('pb'), min(s * w, s * (w - .03)), max(s * w, s * (w - .03)), .34, .5, -L, L, 'S_blue', omit=('+z',))
        for zp in (-L, 0.0):
            obox(nm('pp'), min(s * w, s * (w - .1)), max(s * w, s * (w - .1)), 0, CW['par'], zp, zp + .5, 'S_pale_s', omit=('-y', '+y', '+x' if s > 0 else '-x'))
        with G.at(M=T(s * o, 0, 0) @ RY(s * math.pi / 2)):
            wall(-L, L, sp, CW['par'], 'Tufa')
            quad(nm('uw'), [(-L, bed, 0), (L, bed, 0), (L, sp, 0), (-L, sp, 0)], 'S_shade', (0, 0, 1))
            pbox(nm('sc'), -L, L, -.32, -.12, 0, .07, 'Basalt', lean='front_top')
    # the closed end: the body's section down to the bed, the parapets' ends over the deck
    quad(nm('en'), [(-o, sp, -L), (o, sp, -L), (o, 0, -L), (-o, 0, -L)], 'Tufa', (0, 0, -1))
    quad(nm('eu'), [(-o, bed, -L), (o, bed, -L), (o, sp, -L), (-o, sp, -L)], 'S_shade', (0, 0, -1))
    for s in (-1, 1):
        quad(nm('ep'), [(s * w, 0, -L), (s * o, 0, -L), (s * o, CW['par'], -L), (s * w, CW['par'], -L)], 'Tufa', (0, 0, -1))

def cw_head():
    """THE CAUSEWAY'S END (MM-15): where the road meets the land, at both ends (Moonmere's Landing, the
    Shores' strand). Two banded pylons on the deck's corners, each a basalt-plinthed tufa pier 1.2 m
    square and 3.1 m tall under a pale cornice, carrying a lantern. Origin: the deck's top on its
    centre line at the deck's END; +z along the deck (onto the causeway), so a head faces the land. The pylons stand x +-(4.25..5.45), z
    0.1..1.3, on the parapets' line (the walk unchanged: makeCauseway's colliders stand there)."""
    for s in (-1, 1):
        x0, x1 = sorted((s * 4.25, s * 5.45)); z0, z1 = .1, 1.3
        cx = (x0 + x1) / 2
        obox(nm('pyb'), x0 - .08, x1 + .08, -.6, .5, z0 - .08, z1 + .08, 'Basalt', omit=('-y',))
        obox(nm('py'), x0, x1, .5, 3.1, z0, z1, 'Tufa', omit=('-y', '+y'))
        obox(nm('pyc'), x0 - .14, x1 + .14, 3.1, 3.36, z0 - .14, z1 + .14, 'S_pale_s')
        # the lantern (S4 review: the 0.44 m glowing block read as a white cube at night, the
        # first thing an arrival sees): lamp_post's own lantern at the pylon's scale -- a glass
        # core 0.3 m square in an iron frame, its four corner posts standing proud of the panes
        # from an iron ring under it up to the little pyramid cap's eaves. Only the panes are the
        # Glow swatch, so only they bloom
        g, zc = .15, .7
        obox(nm('pyl'), cx - g, cx + g, 3.46, 3.95, zc - g, zc + g, 'Glow', omit=('-y', '+y'))
        for sx in (-1, 1):
            for sz in (-1, 1):
                px, pz = cx + sx * g, zc + sz * g
                obox(nm('pyf'), px - .035, px + .035, 3.44, 3.95, pz - .035, pz + .035, 'S_iron',
                     omit=('-y', '+y', '-x' if sx > 0 else '+x', '-z' if sz > 0 else '+z'))
        obox(nm('pyi'), cx - .21, cx + .21, 3.36, 3.46, zc - .21, zc + .21, 'S_iron', omit=('-y',))
        cap = [(cx - .26, 3.95, zc - .26), (cx + .26, 3.95, zc - .26), (cx + .26, 3.95, zc + .26), (cx - .26, 3.95, zc + .26), (cx, 4.24, zc)]
        for a_, b_ in ((0, 1), (1, 2), (2, 3), (3, 0)):
            P = [cap[a_], cap[b_], cap[4]]
            mid = ((P[0][0] + P[1][0]) / 2 - cx, 0, (P[0][2] + P[1][2]) / 2 - .7)
            mesh(nm('pyk'), P, [(0, 1, 2)], 'S_iron', facing=(mid[0], .5, mid[2]))


def register_causeway():
    """MM-15's modules (MOONMERE.md A-14): the causeway's bay and its ends. The Shores' landward steps are
    two street flight segments (flight_seg: a metre's rise over its 2.08 m, the ramp's own) between
    cheek walls, and the Shores' gate is the Landing's own Causeway Gate (cg_shell): the road passes
    the same gate at both ends of the causeway. No far form: the bay stays one pool at every distance
    and its 650 triangles a bay are nothing past 100 m; its bytes are a contract cap."""
    o_bay = "the deck's top on its centre line, mid-bay; +z along the causeway"
    o_end = "the deck's top on its centre line at its end; +z onto the causeway"
    reg('cw_bay', cw_bay, 'ground', mode='trim', ao=.8, budget=650, origin=o_bay)
    reg('cw_head', cw_head, 'ground', mode='trim', ao=.6, budget=200, origin=o_end)
    reg('cw_abut', cw_abut, 'ground', mode='trim', ao=.8, budget=200, origin=o_bay)


def register_more():
    register_causeway()
    reg('tower_a', lambda: tower('a'), 'tower', mode='shell', ao=1.2, budget=9000, origin='centre')
    reg('tower_b', lambda: tower('b'), 'tower', mode='shell', ao=1.2, budget=9000, origin='centre')
    reg('tower_a_l1', lambda: tower_l1('a'), 'lod1', mode='shell', det=2, budget=1200, origin='centre')
    reg('tower_b_l1', lambda: tower_l1('b'), 'lod1', mode='shell', det=2, budget=1200, origin='centre')
    reg('cap_tower', cap_tower, 'skyline', mode='roof', budget=400, origin="the tower's axis at its eave (the tower's 'cap' mount)")
    reg('lt_shell', lambda: long_tower('shell'), 'civic', mode='shell', det=1, ao=1.5, budget=16000, origin='centre')
    reg('lt_shell_l1', lt_far, 'lod1', mode='shell', det=2, ao=1.5, budget=3000, origin='centre')
    reg('lt_louvres', lt_louvres, 'civic', mode='shell', ao=.4, budget=3000, origin='centre (place with lt_shell)')
    for n, f, b in (('ar_shell', ar_shell, 14000), ('bs_shell', bs_shell, 14000), ('mc_shell', mc_shell, 22000),
                    ('ch_shell', ch_shell, 10000), ('inn_shell', inn_shell, 10000), ('pg_shell', pg_shell, 10000),
                    ('cg_shell', cg_shell, 10000), ('al_shell', al_shell, 6000), ('lodge_shell', lodge_shell, 6000), ('lodge_shell_b', lodge_shell_b, 6000),
                    ('sl_shell', sl_shell, 6000), ('bh_bay', bh_bay, 2500)):
        reg(n, f, 'civic', mode='shell', det=1, ao=1.0, budget=b, origin='centre')
    # 2026-10-11: the Exchange, Moonmere's auction house, and its far form (lt_shell's pattern: its
    # own LOD triple, ex_shell to 140 m and ex_shell_l1 for ever), and its floor's fittings
    reg('ex_shell', ex_shell, 'civic', mode='shell', det=1, ao=1.0, budget=EX_BUDGET['ex_shell'], origin='centre')
    reg('ex_shell_l1', ex_shell_l1, 'lod1', mode='shell', det=2, ao=1.0, budget=EX_BUDGET['ex_shell_l1'], origin='centre')
    reg('ex_in', ex_in, 'interior', mode='shell', det=1, ao=.6, budget=EX_BUDGET['ex_in'], origin='centre')
    for n, f in (('lt_in', lt_in), ('bs_in', bs_in), ('al_in', al_in), ('ar_in', ar_in), ('lodge_in', lodge_in), ('ch_in', ch_in),
                 ('mc_in', mc_in), ('inn_in', inn_in), ('home_in', home_in), ('oh_in_a', lambda: open_house('a')),
                 ('oh_in_b', lambda: open_house('b')), ('shop_in', shop_in), ('wr_in', wr_in)):
        reg(n, f, 'interior', mode='shell', det=1, ao=.6, budget=6000, origin='centre' if n not in ('home_in', 'oh_in_a', 'oh_in_b', 'shop_in', 'wr_in') else 'bay')
    G_ = {'quay_wall': (quay_wall, 400), 'quay_stair': (quay_stair, 2000), 'flight_seg': (flight_seg, 300),
          'cheek_wall': (cheek_wall, 600), 'lane_wall': (lane_wall, 600), 'parapet_run': (parapet_run, 600), 'kerb': (kerb, 600),
          'pier_deck': (pier_deck, 600), 'riser_rock': (riser_rock, 600), 'flight_flank': (flight_flank, 120),
          'cheek_landing': (cheek_landing, 200)}
    for n, (f, b) in G_.items():
        reg(n, f, 'ground', mode='trim', ao=.8, budget=b, origin='ground')
    reg('quay_wall_l1', quay_wall, 'lod1', mode='trim', det=2, budget=60, origin='ground')
    reg('flight_seg_l1', flight_seg_l1, 'lod1', mode='trim', det=2, budget=40, origin='ground')
    reg('riser_rock_l1', lambda: riser_rock(l1=True), 'lod1', mode='trim', det=2, budget=60, origin='ground')
    D_ = {'lamp_bracket': lamp_bracket, 'lamp_post': lamp_post, 'bench_stone': bench_stone, 'planter': planter,
          'sign_ink': lambda: sign('quill'), 'sign_cup': lambda: sign('cup'), 'sign_key': lambda: sign('key'), 'vine_wall': vine_wall,
          'lemon_tub': lemon_tub, 'well_head': well_head, 'cafe_set': cafe_set, 'washing_line': washing_line,
          'crate_stack': crate_stack, 'net_rack': net_rack, 'bollard': bollard, 'boat_skiff': boat_skiff, 'boat_launch': boat_launch,
          # look pass M2: the variants planDressing chooses among per bay (templates file `variants`)
          'lamp_lantern': lamp_lantern, 'lamp_sconce': lamp_sconce, 'plaque_ring': plaque_ring, 'plaque_moon': plaque_moon,
          'plaque_lemon': plaque_lemon, 'planter_herb': lambda: planter('herb'), 'planter_trail': lambda: planter('trail'),
          'vine_rose': vine_rose, 'vine_wisteria': vine_wisteria, 'lemon_pot': lemon_pot,
          # A-7: what a load bay's hoist holds
          'hoist_sacks': hoist_sacks, 'hoist_barrel': hoist_barrel, 'crystal_dais': crystal_dais}
    # S1 (MM-13, MM-14): the Moon Fountain on the Mere Stair, the court's fountain, its market
    # (S1 review, A-9: the falls and jets modelled as sheets, court_fountain 1300 -> 2100 and
    # mere_fountain 2400 -> 2500; wall_arcade)
    # A-13 (S3 review): the gardens' trees, the Long Garden's bed, the Inn Pier's rail, W3's long line
    for n, f in (('orchard_lemon_a', orchard_lemon_a), ('orchard_lemon_b', orchard_lemon_b), ('olive_tree', olive_tree),
                 ('cypress', cypress), ('oleander', oleander), ('herb_bed', herb_bed), ('pier_rail', pier_rail),
                 ('washing_line_long', washing_line_long)):
        reg(n, f, 'dressing', mode='trim', ao=.4, budget=900, origin='mount')
    for n, f, b in (('mere_fountain', mere_fountain, 2500), ('court_fountain', court_fountain, 2100),
                    ('market_stall_a', market_stall_a, 1300), ('market_stall_b', market_stall_b, 1300),
                    ('wall_arcade', wall_arcade, 400)):
        reg(n, f, 'dressing', mode='trim', ao=.6, budget=b, origin='mount')
    for n, f in D_.items():
        reg(n, f, 'dressing', mode='trim', ao=.4, budget=1500 if n == 'well_head' else 900, origin='mount')
    reg('stall_pentice', stall_pentice, 'dressing', mode='joinery', ao=.3, budget=900, origin='mount')
    reg('bench_timber', bench_timber, 'dressing', mode='joinery', ao=.3, budget=900, origin='mount')


# ====================================================================== the catalogue
CAT = TEMPLATES['categories']
LODS = TEMPLATES['lods']
REG = {}          # name -> (fn, kind, mode, det, ao_dist, budget, origin)


def reg(name, fn, kind, mode='bay', det=0, ao=.8, budget=None, origin='bay'):
    REG[name] = (fn, kind, mode, det, ao, budget, origin)


ORIGIN = {
    'bay': 'pavement at the facade plane, centred on the bay; +z the street',
    'roof': 'bay centre on the facade plane, y 0 = the eave datum (place at groundY + eave[rank])',
    'end': 'the end wall line at MID-DEPTH (z = -depth/2 in the house frame), y 0 = the eave datum; +x out through the end; -x end: yaw + pi',
    'ret': 'the end face centre at the ground (x = 0 plane, facing +x), depth along z; -x end: yaw + pi; stretch z to 8.0/8.5',
    'monoend': 'the end wall line on the facade plane, y 0 = the eave datum; symmetric about x = 0: the same yaw at both ends',
    'pav': "the house's centre at mid-depth, y 0 = the eave datum; stretch x 1.5 for three bays",
    'quoin': 'the +x front corner at the ground; the -x corner takes yaw - pi/2',
    'centre': 'the footprint centre on its ground; +z the front',
    'turretcap': "the turret's axis at its top (half_turret mount 'cap')",
    'ground': 'see the template header (manifest `about`)',
    'mount': 'the mount point (manifest `mounts` of the host file)',
}


def build(name):
    global DET, FLATWIN
    fn, kind, mode, det, ao, budget, origin = REG[name]
    DET = det; G.LOD = 1 if det == 2 else 0; G.MODE = mode
    # MOONMERE.md "A LOD1 keeps its bay's outline": a door, gate, shop, loggia, loading arch or
    # oriel stays an opening; a window is painted on at 45 m (the mock-up's painted-front LOD1)
    FLATWIN = det == 2 and (kind == 'lod1')
    G.UOFF = (int(hashlib.md5(name.encode()).hexdigest()[:4], 16) % 4) * 1.0 + .5
    MOUNTS.clear(); N[0] = 0; FLIGHTS.clear()
    G.start(name)
    fn()
    # THE FOOT RULE: every template whose flights are drawn by flight_rec is measured, and refused
    # when a foot is crowded
    if FLIGHTS and INTERIOR.get(name, {}).get('stairs'):
        foot_check(name)
    extra = {'lodLevel': {0: 0, 1: 0, 2: 1}[det], 'origin': ORIGIN.get(origin, origin), 'mode': mode}
    if name in INTERIOR: extra['interior'] = INTERIOR[name]
    FLATWIN = False
    if MOUNTS and det != 2: extra['mounts'] = list(MOUNTS)
    G.save(name, OUT, ao=True, ao_dist=ao, kind=kind, budget=budget, extra=extra)
    DET = 0; G.LOD = 0; G.MODE = 'bay'


def register_all():
    for back in ('win', 'door', 'gate', 'shop', 'loggia'):
        reg(f'bay_ct_{back}', lambda b=back: ct(b), 'bay', budget=3200)
    for back in ('door', 'shop', 'win', 'oriel'):
        reg(f'bay_st_{back}', lambda b=back: st(b), 'bay', budget=3200)
    reg('bay_cy_win', cy, 'bay', budget=1800)
    reg('bay_cl_arch', cl, 'bay', budget=2600)
    reg('bay_rs_win', rs, 'bay', budget=1800)
    reg('bay_rs_back', rs_back, 'bay', budget=1800)
    # (A-14: no 'win' -- the layout's warehouses open load and door bays only; bay_wr_win and its LOD1
    # were never placed, and their 67 KB went to the causeway, MM-15)
    for back in ('load', 'door'):
        reg(f'bay_wr_{back}', lambda b=back: wr(b), 'bay', budget=2400)
    for back in ('win', 'door'):
        reg(f'bay_hl_{back}', lambda b=back: hl(b), 'bay', budget=3000)
    reg('half_turret', half_turret, 'half', budget=1800)
    reg('half_postern', half_postern, 'half', budget=1800)
    # LOD1: the same bay with only its outline (DET 2)
    L1 = {'bay_ct_l1': lambda: ct('win'), 'bay_ct_l1_door': lambda: ct('door'), 'bay_ct_l1_open': lambda: ct('gate'),
          'bay_st_l1': lambda: st('win'), 'bay_st_l1_door': lambda: st('door'), 'bay_st_l1_oriel': lambda: st('oriel'),
          'bay_cy_l1': cy, 'bay_rs_l1': rs, 'bay_cl_l1': cl, 'bay_wr_l1_open': lambda: wr('load'),
          'bay_hl_l1': lambda: hl('win'), 'bay_hl_l1_door': lambda: hl('door'),
          'half_turret_l1': half_turret, 'half_postern_l1': half_postern, 'bay_rs_back_l1': rs_back}
    for n, f in L1.items():
        reg(n, f, 'lod1', det=2, budget=700)
    reg('ret_flank', lambda: ret(12.0), 'corner', budget=1200, origin='ret')
    reg('ret_low', lambda: ret(7.2, low=True), 'corner', budget=1200, origin='ret')
    reg('ret_flank_l1', lambda: ret(12.0), 'lod1', det=2, budget=60, origin='ret')
    reg('ret_low_l1', lambda: ret(7.2, low=True), 'lod1', det=2, budget=60, origin='ret')
    reg('corner_quoin', corner_quoin, 'corner', mode='trim', budget=1200, origin='quoin')
    for slot, top in (('ct', 11.6), ('st', 12.0), ('cy', 11.6), ('wr', 6.2), ('hl', 11.4)):
        reg(f'card_{slot}', lambda s=slot, t=top: card_file(s, t), 'lod2', mode='card', ao=.05, budget=4)
    reg('card_turret', lambda: card_file('turret', TURRET_TOP, w=2.0), 'lod2', mode='card', ao=.05, budget=4)
    reg('card_tower', card_tower, 'lod2', mode='card', ao=.05, budget=8, origin='centre')
    reg('eave_brk', eave_brk, 'eave', mode='roof', budget=480, origin='roof')
    reg('roof_run', roof_run, 'skyline', mode='roof', budget=120, origin='roof')
    reg('roof_hip_end', roof_hip_end, 'skyline', mode='roof', budget=120, origin='end')
    reg('roof_gable_end', roof_gable_end, 'skyline', mode='roof', budget=120, origin='end')
    reg('roof_mono', roof_mono, 'skyline', mode='roof', budget=120, origin='roof')
    reg('roof_mono_end', roof_mono_end, 'skyline', mode='roof', budget=120, origin='monoend')
    reg('roof_pav', roof_pav, 'skyline', mode='roof', budget=120, origin='pav')
    reg('roof_flat', roof_flat, 'skyline', mode='roof', budget=120, origin='roof')
    reg('pergola', pergola, 'skyline', mode='roof', budget=900, origin='roof')
    reg('altana', altana, 'skyline', mode='roof', budget=900, origin='roof')
    reg('chimney', chimney, 'skyline', mode='roof', budget=300, origin='roof')
    reg('cap_turret', cap_turret, 'skyline', mode='roof', budget=300, origin='turretcap')
    reg('shutters_pair', shutters_pair, 'joinery', mode='joinery', ao=.2, budget=120, origin='mount')
    reg('door_leaf', door_leaf, 'joinery', mode='joinery', ao=.2, budget=120, origin='mount')
    try:
        register_more()
    except NameError:
        pass


def write_manifest(built):
    mp = OUT / 'manifest.json'
    files = {}
    if mp.exists() and ONLY:
        try: files = json.loads(mp.read_text()).get('files', {})
        except Exception: files = {}
    files.update({k: v for k, v in G.CATALOG.items()})
    names = set(REG)
    files = {k: files[k] for k in sorted(files) if k in names and (OUT / f'{k}.glb').exists()}
    modules = {}
    for n in sorted(files):
        if n in LODS:
            modules[n] = {'kind': files[n]['kind'], 'lods': LODS[n]}
        elif not any(n in l[1:] for l in LODS.values()):
            modules[n] = {'kind': files[n]['kind'], 'lods': [n]}
    ratios = {}
    for n, l in LODS.items():
        if n in files and l[1] in files and l[1] != n:
            ratios[n] = round(files[l[1]]['tris'] / max(1, files[n]['tris']), 4)
    mats = sorted({m for r in files.values() for m in r['materials']})
    man = {
        'about': "Moonmere's Banded Cloisters module library, generated by tools/assets/build_moonmere_cloister_modules.py -- never hand-edit.",
        'contract': 'MOONMERE.md section 5; client/src/moonmere-templates.json',
        'units': 'metres', 'up': 'Y', 'outward': '+Z',
        'datums': dict(DAT, podium=POD, turretTop=TURRET_TOP, tileEdge=YE, ridge=round(YR, 3), pitchDeg=18),
        'lodDistances': DAT['lod'],
        'materials': MATERIAL_BINDINGS,
        'facades': FACADES,
        'backFaceCulling': 'every material is single-sided (glTF doubleSided false): keep backFaceCulling on',
        'vertexColor': 'COLOR_0 = baked AO x per-surface shade, grey only (normalised UNSIGNED_BYTE); useVertexColors, hasVertexAlpha = false. Per-instance wash / glaze / joinery tints multiply onto it',
        'uv': 'glTF convention (origin top-left): load every sheet with invertY = false. TEXCOORD_0 is normalised UNSIGNED_SHORT where a primitive fits one sheet copy, else FLOAT (strips tile in U: sampler wrap REPEAT)',
        'tint': TEMPLATES['tint'], 'masks': TEMPLATES['masks'],
        'interfaces': INTERFACES,
        'modules': modules,
        'lod1Ratio': ratios,
        'files': files,
        'totals': {'files': len(files), 'tris': sum(r['tris'] for r in files.values()),
                   'glbBytes': sum(r.get('bytes', 0) for r in files.values())},
    }
    # (S2 review: written compact -- the folder's bytes are a contract cap, and the indented form
    # was 107 KB of it; nothing at runtime reads this file, the layout carries its mounts)
    mp.write_text(json.dumps(man, separators=(',', ':'), sort_keys=False) + '\n')
    print('MANIFEST', len(files), 'files', mats, 'glb bytes', man['totals']['glbBytes'])
    for f, r in sorted(ratios.items()):
        print(f'  lod1 {f:22s} {files[f]["tris"]:6d} -> {files[LODS[f][1]]["tris"]:5d}  {r:.3f}', ' OVER' if r > .25 else '')


MATERIAL_BINDINGS = {
    'MC_Stone': {'facade': 'mc_facade', 'albedo': 'mc_facade.jpg', 'roughness': 0.9, 'about': 'tufa, basalt, lime, pale stone: the facade group (night emissive)'},
    'MC_Timber': {'facade': 'mc_facade', 'albedo': 'mc_facade.jpg', 'roughness': 0.7, 'about': 'walnut timber, oak doors in the bays'},
    'MC_Glass': {'facade': 'mc_facade', 'albedo': 'mc_facade.jpg', 'roughness': 0.12, 'about': 'panes, lamp niches; lit by mc_facade_night.png'},
    'MC_Roof': {'facade': 'mc_trim', 'albedo': 'mc_facade.jpg', 'roughness': 0.35, 'about': 'roofs, eaves, ground and dressing: the trim group, NO emissive'},
    'MC_Joinery': {'facade': 'mc_trim', 'albedo': 'mc_facade.jpg', 'roughness': 0.62, 'about': 'shutters, door leaves, pentices: neutral, tinted per instance'},
    'MC_Metal': {'color': '#b48c48', 'roughness': 0.35, 'metallic': 0.9, 'about': 'brass on civic pieces (telescopes, armillary, finials)'},
    'MC_Glow': {'color': '#ffc46e', 'emissive': '#ffc46e', 'glow': 1.0, 'about': 'lamp cores; metadata.glow 1.0'},
    'MC_Water': {'water': True, 'about': 'makeClearWaterMat; reserved: no module carries water'},
    'MC_Leaf': {'albedo': 'mc_leaf.png', 'roughness': 0.75, 'alphaTest': 0.45,
                'about': 'A-7: the trees\' own RGBA sheet (leaf sprays, lemons, bark, tub, pot, soil); alpha tested, one submesh a tree'},
}
FACADES = [
    {'name': 'mc_facade', 'parts': ['MC_Stone', 'MC_Timber', 'MC_Glass'], 'albedo': 'mc_facade.jpg', 'rough': 'mc_facade_rough.png',
     'night': 'mc_facade_night.png', 'layout': 'mc_facade.json', 'glow': 0.55},
    {'name': 'mc_trim', 'parts': ['MC_Roof', 'MC_Joinery'], 'albedo': 'mc_facade.jpg', 'rough': 'mc_facade_rough.png',
     'night': None, 'layout': 'mc_facade.json'},
]
INTERFACES = {
    'gatePassages': 'bay_ct_gate and bay_ct_loggia carry their own 9 m passage AND their court face: place NO bay_cy_win behind them',
    'interiors': 'home_in, oh_in_a, oh_in_b, shop_in are 3 bays (x -6..6) centred on the house\'s DOOR bay (its middle 4 m): the door / shop bay carries its own ground-storey inside face; the interior lines everything else',
    'mounts': "a file's `mounts` (its own frame): lamp, sign, pentice, planter, vine, crates, nets (planDressing); shutters and door (the joinery pools: door_leaf at the mount, axes as given); cap (a tower's or turret's cap)",
    'roofFlat': 'roof_flat: the lap-edge balustrade (1.1 m) stands on z -9.3 .. -9.04 (x 0.889 for 8.0, x 0.944 for 8.5); collider is the planner\'s',
    'eaveBrk': 'eave_brk goes with roof_run / roof_hip_end / roof_gable_end slices (hip and gable crowns), never with roof_mono, roof_flat or roof_pav',
}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    G._MAT.clear()
    register_all()
    want = set(REG) if not ONLY else (set(REG) & ONLY)
    missing = [n for c in CAT.values() for n in c if n not in REG]
    if missing: print('NOT YET REGISTERED', len(missing), missing)
    for n in sorted(want):
        build(n)
    if not ONLY:
        keep = {f'{n}.glb' for n in REG}
        for f in OUT.glob('*.glb'):
            if f.name not in keep: f.unlink(); print('removed stale', f.name)
    write_manifest(want)


# (a refused build -- THE FOOT RULE's RuntimeError, or any other -- exits non-zero however Blender is
# invoked: `blender -b --python` alone returns 0 after a script's traceback, so a chained
# `&& moonmere_layout.py` would run on a build that wrote nothing. The runbook also passes
# --python-exit-code 1.)
try:
    main()
except Exception:
    import sys, traceback
    traceback.print_exc()
    sys.stdout.flush(); sys.stderr.flush()
    sys.exit(1)
