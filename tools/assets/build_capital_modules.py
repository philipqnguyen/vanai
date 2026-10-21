"""The Capital's ORIGINAL Colonnade module library (Philip, 2026-10-04: the PURE
Colonnade City; original designed assets, not the village kit).

Reproduce everything -- sheets, every module and LOD, manifest.json -- with

    blender -b --python tools/assets/build_capital_modules.py

(it runs `python3 tools/assets/paint_capital_textures.py` first; pass `-- --no-paint`
to skip that, or `-- name1 name2` to rebuild only those modules, which merges
into the existing manifest). Output: client/public/models/capital/ -- ONLY what the
game loads (the runtime-request recording of 2026-10-05 and capital_layout.test.mjs
hold the folder to the plans): every module and LOD the zones place, the sheets
they bind and manifest.json. The parts the merged shells are made of (MERGE_ONLY)
are exported to tools/assets/build/capital/ (gitignored) and recorded under the
manifest's `parts`; a full build deletes any .glb in the output it did not write.
Ported from the approved mock-up (scratch grand/colonnade-dome, cl_modules.py);
the geometry conventions are in capital_geom.py, the sheet layout in
capital_atlas.py.

PERFORMANCE BY DESIGN (Philip's gate, decisions 10):
  * eight materials in all (capital_geom.MATERIALS); every house bay uses three
    (CL_Stone, CL_Glass, CL_Fabric), its LOD2 one;
  * a house is built from MERGED BAY COLUMNS: one template = one 4 m bay from the
    pavement to the balustrade coping -- arcade, vault, back wall, piano nobile,
    attic, entablature, balustrade and that city's shutters -- so a street draws
    a handful of batches per culling cell instead of one per baluster;
  * LOD1 of every bay drops the swept mouldings and lathed balusters for the
    painted ent_strip / bal_strip and box masses (<= 25% of LOD0's triangles);
    LOD2 is one quad carrying the painted elevation of its rank. A LOD1 is built
    only where the runtime draws it: a door bay's far file is its blind's, a ward
    bay's the ward window's, a courtyard bay goes straight to its card (bay_lods,
    capital_blocks.ts bayFiles);
  * manifest.json records triangles, materials, bounds and the budget of every
    module and LOD; client/test/capital_modules.test.mjs holds them to it.

DATUMS -- the avenue house's facade tops out at 12.5 m (the coping):
    arcade 0-4.4 | piano nobile 4.4-8.2 | attic 8.2-10.6 | entablature 10.6-11.7 |
    balustrade 11.7-12.5.     Ward rank: rusticated ground 0-4.4 | nobile 4.4-8.2 |
    entablature 8.2-9.3 | balustrade 9.3-10.1.
UNDER THE CURTAIN (decisions 13, 2026-10-05, settling K1's open question): the city
curtain was RAISED to a 15 m walk with its parapet's coping at 16.2 (THE WALLS,
below), so the direction's 22 deg street roof keeps its golden band -- ridges at
14.49 m, a projecting centre's pediment at 13.53 -- and the corner belvederes were
lowered to 15 m all told. Only the chimney pots (15.7) stand over the walk, none
over the coping; manifest.json `curtain` records every top as mounted and the
test pins them.

A bay's origin is the pavement at the facade plane (z = 0), centred on the bay;
+z is the street. An arcade house's own front stands 4 m back (z = -4), its
courtyard face at z = -14 (a 14 m plot); courtyard bays are placed there turned
half round. Carriage passages run the whole plot: the street bay carries the
tunnel, the courtyard bay only its exit arch.
"""
import sys, math, json, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector, Matrix
import capital_geom as G
import capital_atlas as A
from capital_geom import box, prism, lathe, sweep, run_x, corner_frames, arc_frames, face_frame, fan, arch_wall, \
    path_frames, scroll_console, quad, card, mesh, leaf_sheet, soffit, at

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/public/models/capital'
BUILD = ROOT / 'tools/assets/build/capital'   # MERGE_ONLY parts: built, merged, never shipped
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PAINT = '--no-paint' not in argv
ONLY = {a for a in argv if not a.startswith('--')} or None
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)
if PAINT:
    subprocess.run(['python3', str(Path(__file__).resolve().parent / 'paint_capital_textures.py')], check=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

BAY = 4.0; HW = BAY / 2
H_ARC, H_NOB, H_ATT, H_ENT, H_BAL = 4.4, 3.8, 2.4, 1.1, 0.8
Y_NOB = H_ARC; Y_ATT = Y_NOB + H_NOB; Y_ENT = Y_ATT + H_ATT; Y_BAL = Y_ENT + H_ENT; Y_TOP = Y_BAL + H_BAL
Y_ENT_W = Y_ATT; Y_BAL_W = Y_ENT_W + H_ENT; Y_TOP_W = Y_BAL_W + H_BAL
BAND_Y = H_ARC - .34                 # the storey band under the piano nobile
WALK = 4.0; PD = 1.0                 # arcade walk depth (front face to house front), pier depth
PLOT = 14.0                          # plot depth: the courtyard face
WARD_D = 7.0                         # a ward house's depth (capital_blocks.ts wardDepth): its tunnel's length
ARCH = (1.4, 2.35)                   # arcade arch: radius, springing (crown 3.75, archivolt kisses the band)
PASS = (1.6, 2.15)                   # carriage passage: 3.2 m clear, the same crown
VAULT_SP, VAULT_R = 2.8, 1.5         # the walk's barrel along the street
RAD = math.radians
JOINT_LAP = .015                     # a bay's masonry laps its neighbour's at the joint (arcade_front)


def lod(): return G.LOD


def cyma(o0, u0, o1, u1, n=6, recta=True):
    if G.LOD: n = max(1, n // 3)
    pts = []
    for i in range(1, n + 1):
        t = i / n
        s = (1 - math.cos(math.pi * t)) / 2 if recta else math.sin(math.pi / 2 * t)
        pts.append((o0 + (o1 - o0) * s, u0 + (u1 - u0) * t))
    return pts


def scaled(prof, sa, sb): return [(a * sa, b * sb) for a, b in prof]


# ---------------------------------------------------------------- designed profiles (a = out, b = up)
def BAND(): return [(0, 0), (.36, 0), (.36, .13), (.39, .14), (.39, .22)] + cyma(.39, .22, .46, .30, 4) + [(.46, .34), (0, .34)]
def SILL(): return [(0, 0), (.06, 0), (.10, .03), (.14, .07), (.14, .15), (.12, .18), (0, .18)]
# The house entablature, now 1.10 tall projecting 0.80 (the mock-up's 1.30 / 0.92
# profile scaled): two fascias, the frieze where the chain-ticks sit, bed moulding,
# dentil band, a deep corona with a flat soffit that drinks shadow, a cyma crown.
ENT_SA, ENT_SB = .87, H_ENT / 1.3
def ENT():
    p = [(0, 0), (.06, 0), (.06, .17), (.09, .18), (.09, .36)] + cyma(.09, .36, .15, .43, 3) + \
        [(.15, .45), (.06, .45), (.06, .86)] + cyma(.06, .86, .20, .95, 4, recta=False) + \
        [(.20, .97), (.22, .97), (.22, 1.09), (.82, 1.09), (.82, 1.11), (.84, 1.12), (.84, 1.20)] + \
        cyma(.84, 1.20, .92, 1.28, 4) + [(.92, 1.30), (0, 1.30)]
    return scaled(p, ENT_SA, ENT_SB)
def PLINTH(): return [(0, 0), (.12, 0), (.12, .20)] + cyma(.12, .20, .04, .30, 3) + [(0, .30)]
def CENT():
    return [(0, 0), (.08, 0), (.08, .24), (.12, .25), (.12, .48), (.16, .49), (.16, .70)] + cyma(.16, .70, .24, .80, 3) + \
        [(.24, .82), (.08, .82), (.08, 1.62)] + cyma(.08, 1.62, .26, 1.74, 4, recta=False) + \
        [(.28, 1.76), (.30, 1.76), (.30, 1.92), (1.12, 1.92), (1.12, 1.95), (1.14, 1.96), (1.14, 2.14)] + \
        cyma(1.14, 2.14, 1.26, 2.34, 5) + [(1.26, 2.40), (0, 2.40)]
def STRING(): return [(0, 0), (.08, 0)] + cyma(.08, 0, .14, .09, 3) + [(.14, .16), (.10, .20), (0, .20)]


# ======================================================================== ARCADE RANK
def tuscan_quarter(cx, s, q=.42):
    """Attached Tuscan half-column at the bay joint, split there: each bay carries
    the quarter on its own side, so neighbours make one half-column together."""
    k = BAND_Y / 4.26
    xa, xb = (cx - q, cx) if s > 0 else (cx, cx + q)
    if lod():
        box('col', xa + .06 * s * 0, xb, 0, BAND_Y, 0, .3, 'Trim'); return
    a0, a1 = (math.pi / 2, math.pi) if s > 0 else (0, math.pi / 2)
    r = .31
    prof = [(r * 1.32, .42, True)] + [(r * 1.32 * (1 - .07 * math.sin(math.pi * t)) + r * .06 * math.sin(math.pi * t), .42 + .14 * t, False) for t in (.33, .66)] + \
           [(r * 1.2, .56, True), (r * 1.03, .62, True)]
    for i in range(0, 5):
        t = i / 4; prof.append((r * (1 - .12 * max(0, (t - .33) / .67) ** 1.5), .62 + (3.92 - .62) * t, False))
    prof += [(r * .93, 3.93, True), (r * 1.0, 3.95, True), (r * 1.0, 4.01, True), (r * .9, 4.06, True)]
    prof += [(r * (.9 + .45 * math.sin(math.pi / 2 * t)), 4.06 + .10 * t, False) for t in (.5, 1.0)]
    prof += [(r * 1.35, 4.16, True), (0, 4.16, True)]
    lathe('half column', [(a, b * k, h) for a, b, h in prof], 'Trim', seg=4, cx=cx, a0=a0, a1=a1, caps=False)
    box('col plinth', xa, xb, 0, .42 * k, 0, q, 'Trim', bevel=.015)
    box('col abacus', xa, xb, 4.16 * k, BAND_Y, 0, q, 'Trim', bevel=.015)


def arcade_front(R, SP):
    """The arcade's street face: two half-piers, the round arch with its archivolt
    and roll-number keystone console, banded rustication into the spandrels, and the
    storey band the half-columns carry."""
    q = .42 if R < 1.5 else HW - R          # a passage's wider arch leaves a slimmer pier
    # (M1, the L look pass: "a line runs diagonally under the vault" -- the sky, through
    # the seam where two bays' half-piers and spandrels met edge to edge, a hairline
    # the rasteriser opens between two meshes. Each bay's masonry now runs JOINT_LAP
    # past its joint, under its neighbour's, so the two overlap instead of abutting.)
    for s in (-1, 1):
        x_in, x_out = s * R, s * (HW + JOINT_LAP)
        # (its top laps the spandrels' foot by JOINT_LAP too: where the pier's top met the
        # spandrel fan's bottom edge at the springing, the same hairline opened along the
        # walk -- the line the look pass saw running diagonally up under the vault)
        box('pier', min(x_in, x_out), max(x_in, x_out), 0 if lod() else .30, SP + 2 * JOINT_LAP, -PD, 0, 'Rustic', bevel=.02)
        if not lod():
            # a passage keeps its 3.2 m clear: no plinth lip or impost on the inner face
            lip = 0 if R >= 1.5 else .06
            box('pier plinth', min(x_in - s * lip, x_out), max(x_in - s * lip, x_out), 0, .30, -PD, .08, 'Trim', bevel=.02)
            pts = [Vector((x_in, SP - .22, -PD)), Vector((x_in, SP - .22, 0)), Vector((s * (HW - .34), SP - .22, 0))]
            nr = [Vector((-s, 0, 0)), Vector((0, 0, 1))]
            if R >= 1.5: pts = pts[1:]; nr = nr[1:]
            if s < 0: pts = pts[::-1]; nr = [Vector((0, 0, 1)), Vector((1, 0, 0))][-len(nr):] if R < 1.5 else [Vector((0, 0, 1))]
            sweep('impost', [(0, 0), (.06, 0)] + cyma(.06, 0, .10, .12, 3) + [(.10, .22), (0, .22)], path_frames(pts, nr), 'Trim')
        tuscan_quarter(s * HW, s, q)
    fan('spandrel', 0, SP, R, -HW - JOINT_LAP, HW + JOINT_LAP, BAND_Y, 0, 'Rustic', (0, 0, 1), n=12)
    fan('spandrel back', 0, SP, R, -HW - JOINT_LAP, HW + JOINT_LAP, BAND_Y, -PD, 'Rustic', (0, 0, -1), n=12)
    soffit('soffit', 0, SP, R, 0, -PD, 'Trim', n=12)
    crown = SP + R
    if not lod():
        AV = [(0, 0), (.04, 0), (.04, .10), (.07, .11), (.07, .20), (.10, .22), (.10, .27), (.04, .30), (0, .30)]
        sweep('archivolt', AV, arc_frames(0, SP, R, 0, math.pi, 12), 'Trim')
        scroll_console('keystone console', 0, crown + .02, BAND_Y, .40, .28, 'Trim')
        box('roll plate', -.1, .1, BAND_Y - .2, BAND_Y - .06, .36, .385, 'Bronze')
    prism('keystone', [(-.15, crown - .02), (.15, crown - .02), (.23, BAND_Y), (-.23, BAND_Y)], -.05, .24, 'Trim', bevel=.012)
    if lod(): box('band', -HW, HW, BAND_Y, H_ARC, 0, .44, 'Trim')
    else: sweep('band', BAND(), run_x(-HW, HW, BAND_Y), 'Trim')


def vault(R, SP):
    """The walk's ceiling: a barrel along the street (springing 2.8, radius 1.5 across
    the walk) pierced by each arch's own barrel -- the groin is the upper envelope
    of the two -- and a transverse rib over the pier at the joint."""
    if lod():
        # LOD1: a flat lime ceiling at the arch crown -- a coarse groin grid cannot
        # follow the arch barrels and showed as wedges through every opening
        quad('ceiling', [(-HW, SP + R + .02, -PD), (HW, SP + R + .02, -PD), (HW, SP + R + .02, -WALK), (-HW, SP + R + .02, -WALK)], 'Plaster', (0, -1, 0))
        return
    NX, NZ = 16, 8
    z0, z1 = -WALK, -PD
    def Af(x): return SP + math.sqrt(max(0, R * R - x * x)) if abs(x) < R else -1
    def Bf(z): return VAULT_SP + math.sqrt(max(0, VAULT_R ** 2 - (z + 2.5) ** 2))
    xs = sorted(set([-HW + BAY * i / NX for i in range(NX + 1)] + [-R, R, -R * .97, R * .97]))
    vs, fs = [], []
    for j in range(NZ + 1):
        z = z0 + (z1 - z0) * j / NZ
        for x in xs: vs.append((x, max(Af(x), Bf(z)), z))
    nx = len(xs)
    for j in range(NZ):
        for i in range(nx - 1):
            a = j * nx + i; fs.append((a, a + 1, a + 1 + nx, a + nx))
    mesh('vault', vs, fs, 'Plaster', facing=(0, -1, 0), smooth=True)
    if not lod():
        fr = []
        for j in range(9):
            z = z0 + (z1 - z0) * j / 8
            dz = -(z + 2.5) / max(1e-3, math.sqrt(max(1e-6, VAULT_R ** 2 - (z + 2.5) ** 2)))
            t = Vector((0, dz, 1)).normalized()
            nrm = Vector((0, -t.z, t.y)) * (1 if t.z > 0 else -1)
            if nrm.y > 0: nrm = -nrm
            fr.append((Vector((-HW, Bf(z), z)), Vector((1, 0, 0)), nrm))
        sweep('rib', [(-.16, -.02), (.16, -.02), (.16, .07), (.12, .11), (-.12, .11), (-.16, .07)], fr, 'Trim')


def back_wall(kind):
    """The house's own front at the back of the walk (z = -4, facing the street):
    DOOR (panelled double door, fanlight), SHOP (glazed front on a stall board),
    BLIND (a niche with a seat) or PASSAGE (the carriage arch, opening the tunnel)."""
    zf, dep = -WALK, .4
    w, ybot, spring = {'door': (.9, 0.0, 2.75), 'shop': (1.3, 0.0, 2.35), 'blind': (.55, .95, 2.65),
                       'passage': (PASS[0], 0.0, PASS[1])}[kind]
    arch_wall('wall', -HW, HW, w, ybot, spring, H_ARC, zf, dep, 'Ashlar', soffit_surf='Trim', back=False, n=12)
    if not lod():
        AR = [(0, 0), (.04, 0), (.04, .05), (.07, .07), (.07, .17), (.04, .2), (0, .2)]
        sweep('architrave', AR, face_frame(-w, w, ybot, spring, zf, arch=True, nseg=10), 'Trim')
    prism('key', [(-.13, spring + w - .02), (.13, spring + w - .02), (.18, spring + w + .3), (-.18, spring + w + .3)], zf - .02, zf + .12, 'Trim', bevel=.01)
    nf = 4 if lod() else 10
    def fanlight(z, s2):
        vs = [(0, s2, z)] + [(w * math.cos(math.pi * i / nf), s2 + (w - .02) * math.sin(math.pi * i / nf), z) for i in range(nf + 1)]
        mesh('fanlight', vs, [(0, i, i + 1) for i in range(1, nf + 1)], 'Fan', facing=(0, 0, 1))
    if kind == 'door':
        quad('door', [(-w, 0, zf - .28), (w, 0, zf - .28), (w, spring, zf - .28), (-w, spring, zf - .28)], 'Door', (0, 0, 1))
        box('transom', -w, w, spring - .02, spring + .1, zf - .3, zf - .2, 'Wood')
        fanlight(zf - .3, spring + .1)
        box('step', -w - .15, w + .15, 0, .14, zf - .02, zf + .38, 'Trim', bevel=.02)
    elif kind == 'shop':
        box('stall board', -w, w, 0, .62, zf - .3, zf - .2, 'Wood', bevel=.01)
        quad('shop glass', [(-w, .62, zf - .28), (w, .62, zf - .28), (w, spring - .05, zf - .28), (-w, spring - .05, zf - .28)], 'GlassShop', (0, 0, 1))
        box('shop transom', -w, w, spring - .05, spring + .1, zf - .32, zf - .18, 'Wood')
        if not lod(): box('shop mullion', -.04, .04, .62, spring, zf - .3, zf - .22, 'Wood')
        fanlight(zf - .3, spring + .1)
        box('shop sill', -w - .05, w + .05, 0, .08, zf - .05, zf + .1, 'Trim')
    elif kind == 'blind':
        if lod():
            quad('niche', [(-w, ybot, zf - .3), (w, ybot, zf - .3), (w, spring + w, zf - .3), (-w, spring + w, zf - .3)], 'Plaster', (0, 0, 1))
        else:
            n = 8; vs, fs, n2 = [], [], []; dd = .38
            for i in range(n + 1):
                a = math.pi * i / n
                for y in (ybot, spring): vs.append((-w * math.cos(a), y, zf - dd * math.sin(a)))
            for i in range(n):
                fs.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1)); am = math.pi * (i + .5) / n
                n2.append(Vector((math.cos(am), 0, math.sin(am))))
            mesh('niche', vs, fs, 'Plaster', normals2=n2, smooth=True)
            vs2, fs2, n3 = [], [], []
            for j in range(4):
                el = math.pi / 2 * j / 3
                for i in range(n + 1):
                    a = math.pi * i / n
                    vs2.append((-w * math.cos(a) * math.cos(el), spring + w * math.sin(el), zf - dd * math.sin(a) * math.cos(el)))
            for j in range(3):
                for i in range(n):
                    a0 = j * (n + 1) + i; fs2.append((a0, a0 + 1, a0 + n + 2, a0 + n + 1))
                    am = math.pi * (i + .5) / n; el = math.pi / 2 * (j + .5) / 3
                    n3.append(Vector((math.cos(am) * math.cos(el), -math.sin(el), math.sin(am) * math.cos(el))))
            mesh('niche dome', vs2, fs2, 'Plaster', normals2=n3, smooth=True)
            box('niche shelf', -w - .08, w + .08, ybot - .1, ybot, zf - dd, zf + .1, 'Trim', bevel=.012)
        box('seat', -1.5, 1.5, 0, .46, zf, zf + .42, 'Trim', bevel=.02)
    if not lod() and kind != 'passage':
        sweep('impost', STRING(), run_x(-HW, -w - .25, VAULT_SP, zf), 'Trim'); sweep('impost', STRING(), run_x(w + .25, HW, VAULT_SP, zf), 'Trim')
        for s in (-1, 1): box('pilaster', min(s * 1.82, s * HW), max(s * 1.82, s * HW), 0, VAULT_SP, zf, zf + .06, 'Trim')


def passage_tunnel(z0, z1):
    """The carriage passage through the house body: 3.2 m between ashlar walls, a
    lime-washed barrel springing at 2.15 (crown 3.75, the arcade's own crown), a
    string at the springing. z0 > z1: from the street-side wall to the courtyard
    wall's inner face."""
    R, SP = PASS
    for s in (-1, 1):
        box('passage wall', min(s * R, s * HW), max(s * R, s * HW), 0, SP, z1, z0, 'Ashlar')
        if not lod():
            # the string sits ON the springing, so nothing narrows the clear below it
            sweep('passage string', [(0, 0), (.06, 0), (.06, .09), (0, .13)], [(Vector((s * R, SP, z0)), Vector((-s, 0, 0)), Vector((0, 1, 0))), (Vector((s * R, SP, z1)), Vector((-s, 0, 0)), Vector((0, 1, 0)))], 'Trim')
    soffit('passage vault', 0, SP, R, z0, z1, 'Plaster', n=12)


def shop_board():
    box('boards', -1.3, 1.3, 0, 2.6, -WALK - .12, -WALK - .08, 'Boards')
    box('board batten', -1.3, 1.3, 1.2, 1.35, -WALK - .08, -WALK - .04, 'Boards')


# the awning's canvas: its head on the shop front, its rod out over the walk. N1
# (the M look pass: "a stray thin diagonal rod across the returned arcade walk"):
# it was 2.75 -> 2.1 m over 1.25, a plane that, run on across the walk, passed
# 1.6-1.8 m up in its middle -- eye height -- so from the walk every awning was
# seen edge-on, its canvas a single dark line from the shop front out toward the
# street (MEASURED: the line's pixels picked the canvas's own faces). Pitched
# flatter and hung higher, its plane stays over 2 m out to the arcade's front, so
# a walker sees its underside, never its edge; its head still crosses the shop
# arch's glazing under the crown (3.65), and the valance clears a head at 2.28.
AWN_HEAD, AWN_ROD = 2.85, 2.5


def awning():
    """RETURNED city: a striped honey-and-white awning out over a shop arch."""
    H, F = AWN_HEAD, AWN_ROD
    vs = [(-1.35, H, -4.0), (1.35, H, -4.0), (1.45, F, -2.75), (-1.45, F, -2.75)]
    quad('awning', vs, 'Awning', (0, 1, .3)); quad('awning under', vs[::-1], 'Awning', (0, -1, -.3))
    v2 = [(-1.45, F, -2.75), (1.45, F, -2.75), (1.45, F - .22, -2.71), (-1.45, F - .22, -2.71)]
    quad('valance', v2, 'Awning', (0, 0, 1)); quad('valance back', v2[::-1], 'Awning', (0, 0, -1))
    box('awning rod', -1.5, 1.5, F - .03, F + .02, -2.77, -2.72, 'Bronze')


# ======================================================================== UPPER STOREYS
WX, WY0, WY1 = .8, .4, 2.95          # piano nobile window: half-width, sill, head
AX, AY0, AY1 = .7, .5, 1.75          # attic window


def wall_with_window(wx, y0, y1, H, surf, depth=.5, hw=HW):
    if lod():
        wall_face(wx, y0, y1, H, surf, depth, hw); return
    box('wall L', -hw, -wx, 0, H, -depth, 0, surf); box('wall R', wx, hw, 0, H, -depth, 0, surf)
    if y0 > 0: box('wall below', -wx, wx, 0, y0, -depth, 0, surf)
    box('wall above', -wx, wx, y1, H, -depth, 0, surf)


def wall_face(wx, y0, y1, H, surf, depth, hw=HW):
    """LOD1 wall: only what can be seen -- the face round the opening and its four
    reveals, not four solid blocks (a third of the triangles)."""
    z = 0.0
    for x0, x1, ya, yb in ((-hw, -wx, 0, H), (wx, hw, 0, H), (-wx, wx, 0, y0), (-wx, wx, y1, H)):
        if yb - ya > 1e-4: quad('wall', [(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)], surf, (0, 0, 1))
    quad('reveal', [(-wx, y0, z), (-wx, y0, -depth), (-wx, y1, -depth), (-wx, y1, z)], surf, (1, 0, 0))
    quad('reveal', [(wx, y0, -depth), (wx, y0, z), (wx, y1, z), (wx, y1, -depth)], surf, (-1, 0, 0))
    quad('reveal', [(-wx, y1, z), (-wx, y1, -depth), (wx, y1, -depth), (wx, y1, z)], surf, (0, -1, 0))
    if y0 > 0: quad('reveal', [(-wx, y0, -depth), (-wx, y0, z), (wx, y0, z), (wx, y0, -depth)], surf, (0, 1, 0))


def nobile(ped='tri', balc=True, pil=True):
    wall_with_window(WX, WY0, WY1, H_NOB, 'Ashlar')
    quad('glass', [(-WX, WY0, -.28), (WX, WY0, -.28), (WX, WY1, -.28), (-WX, WY1, -.28)], 'Glass', (0, 0, 1))
    box('sill', -WX - .12, WX + .12, WY0 - .1, WY0, -.3, .12, 'Trim', bevel=.015)
    if not lod():
        AR = [(0, 0), (.035, 0), (.035, .08), (.06, .09), (.06, .17)] + cyma(.06, .17, .09, .20, 2) + [(.09, .22), (0, .22)]
        sweep('architrave', AR, face_frame(-WX, WX, WY0, WY1, 0), 'Trim')
    y = WY1 + .34; hx = WX + .34
    if ped != 'none':
        if lod():
            box('hood', -hx, hx, WY1 + .22, y + .14, 0, .22, 'Trim')
        else:
            box('frieze', -WX - .22, WX + .22, WY1 + .22, y, 0, .05, 'Trim')
            CR = [(0, 0), (.06, 0)] + cyma(.06, 0, .10, .05, 2) + [(.10, .06), (.20, .06), (.20, .11), (.24, .14), (0, .14)]
            sweep('hood cornice', CR, run_x(-hx, hx, y), 'Trim')
            for s in (-1, 1): scroll_console('console', s * (WX + .28), WY1 - .38, y, .2, .12, 'Trim')
        if ped == 'tri':
            rise = .22
            if lod():
                prism('pediment', [(-hx, y + .14), (hx, y + .14), (0, y + .14 + rise + .08)], 0, .2, 'Trim')
            else:
                pts = [Vector((-hx, y + .14, 0)), Vector((0, y + .14 + rise, 0)), Vector((hx, y + .14, 0))]
                sl = math.atan2(rise, hx)
                nl = Vector((-math.sin(sl), math.cos(sl), 0)); nr = Vector((math.sin(sl), math.cos(sl), 0))
                fr = []
                for i, p in enumerate(pts):
                    Bv = nl if i == 0 else nr if i == 2 else (nl + nr) / (1 + nl.dot(nr))
                    fr.append((p, Vector((0, 0, 1)), Bv))
                sweep('raking', [(0, -.02), (.2, -.02), (.2, .06), (.24, .10), (0, .10)], fr, 'Trim')
                prism('tympanum', [(-hx + .2, y + .14), (hx - .2, y + .14), (0, y + .14 + rise - .07)], -.02, .04, 'Trim')
        else:
            rise = .26; Rr = (hx * hx + rise * rise) / (2 * rise); cy = y + .14 + rise - Rr
            a0 = math.atan2(y + .14 - cy, hx); n = 4 if lod() else 8
            pts = [(Rr * math.cos(a0 + (math.pi - 2 * a0) * i / n), cy + Rr * math.sin(a0 + (math.pi - 2 * a0) * i / n)) for i in range(n + 1)]
            if lod():
                prism('pediment', pts, 0, .2, 'Trim')
            else:
                sweep('segmental', [(0, -.02), (.2, -.02), (.2, .06), (.24, .10), (0, .10)], arc_frames(0, cy, Rr, a0, math.pi - a0, n), 'Trim')
                prism('tympanum', pts, -.02, .04, 'Trim')
    else:
        if lod(): box('hood', -WX - .28, WX + .28, WY1 + .22, WY1 + .35, 0, .12, 'Trim')
        else:
            CR = [(0, 0), (.05, 0)] + cyma(.05, 0, .09, .06, 2) + [(.12, .08), (.12, .13), (0, .13)]
            sweep('hood', CR, run_x(-WX - .28, WX + .28, WY1 + .22), 'Trim')
    if balc:
        bw = 1.12; bz = .46
        box('balcony slab', -bw, bw, WY0 - .17, WY0, -.05, bz + .04, 'Trim', bevel=.02)
        if lod():
            # the painted baluster strip, both faces, under a rail box
            card('balusters', -bw, bw, WY0, WY0 + .57, bz - .14, 'BalStrip', .2, .76, .15, .78, back=True)
            box('rail', -bw, bw, WY0 + .57, WY0 + .68, bz - .28, bz, 'Trim')
        else:
            for s in (-1, 1): scroll_console('balcony console', s * .82, WY0 - .62, WY0 - .17, bz - .06, .14, 'Trim')
            bal = [(.055, 0, True), (.045, .07, True), (.075, .24, False), (.06, .38, False), (.032, .48, True),
                   (.05, .53, True), (.05, .57, True), (0, .57, True)]
            for i in range(6):
                lathe('baluster', [(r, yy + WY0, h) for r, yy, h in bal], 'Trim', seg=6, cx=-.75 + .3 * i, cz=bz - .14)
            box('rail', -bw, bw, WY0 + .57, WY0 + .68, bz - .28, bz, 'Trim', bevel=.015)
            for s in (-1, 1):
                box('balcony post', s * bw - .08, s * bw + .08, WY0, WY0 + .68, bz - .28, bz - .02, 'Trim', bevel=.012)
                box('side rail', s * bw - .06, s * bw + .06, WY0 + .57, WY0 + .68, -.02, bz - .2, 'Trim')
    if pil:
        for s in (-1, 1):
            xa, xb = sorted((s * 1.70, s * HW))
            if lod():
                box('pilaster', xa, xb, 0, H_NOB, 0, .1, 'Trim'); continue
            box('pilaster', xa, xb, .16, 3.5, 0, .08, 'Trim')
            ei = lambda e: (xa - e, xb) if s > 0 else (xa, xb + e)   # widen on the INNER side only: the joint is shared
            box('pilaster base', *ei(.04), 0, .16, 0, .12, 'Trim')
            box('pilaster cap', *ei(.05), 3.5, 3.58, 0, .13, 'Trim')
            box('pilaster neck', xa, xb, 3.58, 3.66, 0, .10, 'Trim')
            box('pilaster abacus', *ei(.07), 3.66, H_NOB, 0, .15, 'Trim')


def attic(pil=True):
    if lod(): box('sill course', -HW, HW, 0, .18, 0, .14, 'Trim')
    else: sweep('sill course', SILL(), run_x(-HW, HW, 0), 'Trim')
    wall_with_window(AX, AY0, AY1, H_ATT, 'Ashlar')
    quad('glass', [(-AX, AY0, -.26), (AX, AY0, -.26), (AX, AY1, -.26), (-AX, AY1, -.26)], 'GlassSq', (0, 0, 1))
    box('sill', -AX - .1, AX + .1, AY0 - .08, AY0, -.28, .1, 'Trim', bevel=.012)
    if not lod(): sweep('architrave', [(0, 0), (.05, 0), (.05, .14), (0, .14)], face_frame(-AX, AX, AY0, AY1, 0), 'Trim')
    if pil:
        for s in (-1, 1):
            xa, xb = sorted((s * 1.76, s * HW)); box('strip', xa, xb, .18, H_ATT, 0, .05, 'Trim')


def shutters(ww, y0, y1, closed):
    """Wooden persiane. EMPTY city: closed in the reveal. RETURNED: folded back on the wall."""
    if closed:
        box('shutter', -ww, ww, y0, y1, -.14, -.10, 'Shutter')
    else:
        for s in (-1, 1):
            xa, xb = sorted((s * (ww + .2), s * (2 * ww + .18)))
            box('shutter leaf', xa, xb, y0, y1, .09, .12, 'Shutter')


def entab(length=BAY, tick=True):
    hl = length / 2
    if lod():
        # LOD1: two masses carrying the painted entablature (ent_strip): the frieze
        # face and the corona face, the corona's soffit and top as a box between
        fy = .78
        box('frieze mass', -hl, hl, 0, fy, 0, .09, 'Trim')
        card('frieze', -hl, hl, 0, fy, .1, 'EntStrip', 0, length / BAY, 0, fy / H_ENT)
        box('corona', -hl, hl, fy, H_ENT, .1, .78, 'Trim')
        card('corona face', -hl, hl, fy, H_ENT, .8, 'EntStrip', 0, length / BAY, fy / H_ENT, 1)
        return
    sweep('entablature', ENT(), run_x(-hl, hl, 0), 'Trim')
    sa, sb = ENT_SA, ENT_SB
    n = int(round(length / .2))
    for i in range(n):
        x = -hl + (i + .5) * length / n
        box('dentil', x - .05, x + .05, .97 * sb, 1.09 * sb, 0, .32 * sa, 'Trim')
    if tick:   # the CHAIN-TICK: one carved tally per 4 m bay, every bay of every street is one chain
        box('tick tablet', -.34, .34, .52 * sb, .80 * sb, .04, .09, 'Trim', bevel=.012)
        box('tick bar', -.035, .035, .55 * sb, .77 * sb, .08, .12, 'Trim')
        prism('tick lozenge', [(0, .74 * sb), (.09, .66 * sb), (0, .58 * sb), (-.09, .66 * sb)], .08, .13, 'Trim')


def pedestal(x, z=0.0, top=H_BAL):
    """A balustrade pedestal, flush with the coping -- no urn, so nothing on a house
    rises above the 12.5 m datum."""
    box('pedestal', x - .26, x + .26, .12, top - .07, z - .24, z + .24, 'Trim', bevel=.015)
    box('pedestal cap', x - .3, x + .3, top - .07, top, z - .28, z + .28, 'Trim', bevel=.015)


def balustrade(length=BAY, ped=True, n=8):
    hl = length / 2
    box('plinth', -hl, hl, 0, .12, -.2, .2, 'Trim', bevel=.015)
    if lod():
        card('balusters', -hl, hl, .12, .62, .14, 'BalStrip', 0, length / BAY, .15, .78)
        quad('balusters back', [(hl, .12, -.14), (-hl, .12, -.14), (-hl, .62, -.14), (hl, .62, -.14)], 'BalStrip', (0, 0, -1),
             uvs=[(0, .15), (length / BAY, .15), (length / BAY, .78), (0, .78)])
        box('rail', -hl, hl, .62, H_BAL, -.2, .2, 'Trim')
        if ped: box('pedestal', -hl, -hl + .26, 0, H_BAL, -.26, .26, 'Trim')
        return
    bal = [(.06, 0, True), (.05, .05, True), (.068, .18, False), (.06, .27, False), (.034, .38, True),
           (.045, .42, True), (.056, .46, True), (.056, .50, True), (0, .50, True)]
    span = length - .6
    for i in range(n):
        lathe('baluster', [(r, y + .12, h) for r, y, h in bal], 'Trim', seg=6, cx=-hl + .3 + span * (i + .5) / n)
    sweep('rail', [(-.2, .62), (.2, .62), (.2, .69), (.17, .75), (.12, .8), (-.12, .8), (-.17, .75), (-.2, .69)],
          [(Vector((-hl, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))), (Vector((hl, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0)))], 'Trim')
    if ped: pedestal(-hl)


def rus_bay(kind='win', w=BAY):
    """Ward street and courtyard ground storey: no arcade -- a rusticated slab with a
    window, a door or the carriage arch under a flat arch of voussoirs, the same
    plinth and storey band, so it reads as the same city one rank lower."""
    hw = w / 2
    if kind == 'passage':
        R, SP = PASS
        arch_wall('slab', -hw, hw, R, 0, SP, BAND_Y, 0, .6, 'Rustic', soffit_surf='Trim', back=True, n=12)
        if lod(): box('band', -hw, hw, BAND_Y, H_ARC, 0, .44, 'Trim')
        else:
            sweep('plinth', PLINTH(), run_x(-hw, -R, 0), 'Trim'); sweep('plinth', PLINTH(), run_x(R, hw, 0), 'Trim')
            sweep('band', BAND(), run_x(-hw, hw, BAND_Y), 'Trim')
            AV = [(0, 0), (.04, 0), (.04, .12), (.08, .14), (.08, .28), (0, .30)]
            sweep('archivolt', AV, arc_frames(0, SP, R, 0, math.pi, 12), 'Trim')
        prism('keystone', [(-.18, SP + R - .02), (.18, SP + R - .02), (.26, BAND_Y), (-.26, BAND_Y)], -.05, .2, 'Trim', bevel=.012)
        return
    x, y0, y1 = (.65, 1.0, 3.1) if kind == 'win' else (.75, 0.0, 3.2)
    wall_with_window(x, y0, y1, BAND_Y, 'Rustic', .6, hw)
    if lod():
        box('band', -hw, hw, BAND_Y, H_ARC, 0, .44, 'Trim')
        prism('flat arch', [(-x - .1, y1), (x + .1, y1), (x + .35, y1 + .5), (-x - .35, y1 + .5)], -.02, .06, 'Trim')
    else:
        sweep('plinth', PLINTH(), run_x(-hw, hw, 0), 'Trim')
        sweep('band', BAND(), run_x(-hw, hw, BAND_Y), 'Trim')
        for i in range(5):   # a flat arch of five voussoirs with a raised keystone
            a = -x - .1 + (2 * x + .2) * i / 5; b = -x - .1 + (2 * x + .2) * (i + 1) / 5
            prism('voussoir', [(a, y1), (b, y1), (b * 1.25, y1 + .5), (a * 1.25, y1 + .5)], -.02, .04 + (.06 if i == 2 else 0), 'Trim', bevel=.01)
    if kind == 'win':
        quad('glass', [(-x, y0, -.3), (x, y0, -.3), (x, y1, -.3), (-x, y1, -.3)], 'GlassSq', (0, 0, 1))
        box('sill', -x - .12, x + .12, y0 - .1, y0, -.32, .1, 'Trim', bevel=.012)
        if not lod():
            for k in range(4): box('grille', -x + (2 * x) * (k + 1) / 5 - .015, -x + (2 * x) * (k + 1) / 5 + .015, y0, y0 + 1.2, -.2, -.17, 'Bronze')
    else:
        quad('door', [(-x, 0, -.3), (x, 0, -.3), (x, y1, -.3), (-x, y1, -.3)], 'Door', (0, 0, 1))
        box('step', -x - .15, x + .15, 0, .14, -.05, .35, 'Trim', bevel=.02)


# ======================================================================== MERGED BAY COLUMNS
RANKS = {
    # rank: (height to the top, what it is)
    'av':  (Y_TOP, 'avenue house, arcade rank: arcade + piano nobile + attic + entablature + balustrade'),
    'avp': (Y_BAL, 'avenue house projecting centre (every 5th house, set 0.6 m forward): as av, pediment instead of balustrade'),
    'wd':  (Y_TOP_W, 'ward street: rusticated ground + piano nobile + entablature + balustrade'),
    'yd3': (Y_BAL, 'courtyard face of an avenue house (placed at z = -14, turned): 3 plain storeys + entablature, eaves behind'),
    'yd2': (Y_BAL_W, 'courtyard face of a ward house: 2 plain storeys + entablature'),
    'sd3': (Y_TOP, 'side-street face of a corner house: avenue height without the arcade'),
}


def bay(rank, back, ped, state):
    e = state == 'e'
    def upper_shutters(att=True):
        with at(y=Y_NOB):
            shutters(WX, WY0, WY1, e)
            # L5: the returned city's window boxes on the ward rank's nobile sills
            # (the avenue's windows have their balconettes)
            if not e and rank not in ('av', 'avp'): window_box()
        if att:
            with at(y=Y_ATT): shutters(AX, AY0, AY1, e)
    if rank in ('av', 'avp'):
        R, SP = PASS if back == 'passage' else ARCH
        arcade_front(R, SP); vault(R, SP); back_wall(back)
        if back == 'passage': passage_tunnel(-WALK - .4, -PLOT + .6)
        if back == 'shop':
            if e: shop_board()
            else: awning()
        with at(y=Y_NOB): nobile(ped, True, True)
        with at(y=Y_ATT): attic(True)
        upper_shutters()
        with at(y=Y_ENT): entab()
        if rank == 'av':
            with at(y=Y_BAL, z=.05): balustrade()
    elif rank == 'wd':
        rus_bay(back)
        # L2: the ward house is 7 m deep (half the avenue's plot), so its tunnel
        # runs 7 m, to the yd2 exit arch on its courtyard face -- at 14 it stood
        # 7 m out into the courtyard
        if back == 'passage': passage_tunnel(-.6, -WARD_D + .6)
        with at(y=Y_NOB): nobile('none', False, False)
        upper_shutters(att=False)
        with at(y=Y_ENT_W): entab()
        with at(y=Y_BAL_W, z=.05): balustrade()
    elif rank == 'yd3':
        rus_bay(back)
        with at(y=Y_NOB): nobile('none', False, False)
        with at(y=Y_ATT): attic(False)
        upper_shutters()
        with at(y=Y_ENT): entab()
    elif rank == 'yd2':
        rus_bay(back)
        with at(y=Y_NOB): nobile('none', False, False)
        upper_shutters(att=False)
        with at(y=Y_ENT_W): entab()
    elif rank == 'sd3':
        rus_bay(back)
        with at(y=Y_NOB): nobile('tri', False, True)
        with at(y=Y_ATT): attic(True)
        upper_shutters()
        with at(y=Y_ENT): entab()
        with at(y=Y_BAL, z=.05): balustrade()


def lod2(rank, state):
    """LOD2: the bay as one quad carrying its rank's painted elevation."""
    H = RANKS[rank][0]
    card('elevation', -HW, HW, 0, H, 0, 'Elev_%s_%s' % (rank, state), 0, 1, 0, H / 12.5)


# ======================================================================== CORNERS, RETURNS
def corner_piece(prof, y, dent=False):
    sweep('corner', prof, corner_frames(y), 'Trim', caps=False)
    if dent: box('corner dentil', 0, .28, .97 * ENT_SB, 1.09 * ENT_SB, 0, .28, 'Trim')


def corner_column(rank):
    """An outer corner, stacked: the mitres where the plinth, storey band, attic sill
    and entablature turn from the z = 0 facade onto the x = 0 one, and the corner
    pedestal of the balustrade. Same contract as the mock-up's corner pieces."""
    corner_piece(PLINTH(), 0)
    corner_piece(BAND(), BAND_Y)
    three = rank in ('av', 'yd3')
    if three: corner_piece(SILL(), Y_ATT)
    ey = Y_ENT if three else Y_ENT_W
    corner_piece(ENT(), ey, dent=True)
    if rank in ('av', 'wd'):
        with at(y=ey + H_ENT): pedestal(-.21, -.21)


def pc_return():
    """The 0.6 m side return of a projecting centre, every storey's material, its
    face at z = 0 running x 0..0.6 (turned to face sideways when placed)."""
    box('return rustic', 0, .6, 0, BAND_Y, -.3, 0, 'Rustic')
    box('return ashlar', 0, .6, Y_NOB, Y_ENT, -.3, 0, 'Ashlar')
    sweep('band', BAND(), run_x(0, .6, BAND_Y), 'Trim')
    sweep('sill', SILL(), run_x(0, .6, Y_ATT), 'Trim')
    sweep('entablature', ENT(), run_x(0, .6, Y_ENT), 'Trim')


def walk_return():
    """The arcade walk's 0.6 m step where an avenue bay meets a projecting-centre
    bay. pc_return closes the facade's step; inside the walk the avp's back wall
    (z -3.4) stands proud of the av's (-4) and its pier and spandrels (from -0.4)
    sit behind the av's (from -1), and both left a slot into the hollow between
    the sheets -- with culling on, a slot onto the sky -- and the two vaults step.
    Thin closed slabs straddling the joint plane, so one module serves either end
    by translation alone (no mirroring, which would turn the faces inside out).
    Origin: the av facade plane (z = 0) at the joint; x along the street.
    MEASURED: renders from both walks, before and after, show it closed."""
    t = .06
    box('walk return wall', -t, t, 0, H_ARC, -WALK, -WALK + .6, 'Ashlar')
    box('walk return pier', -t, t, 0, H_ARC, -PD, -PD + .6, 'Rustic')
    # and the barrels: at the joint the two walks' vaults (the along-street barrel,
    # x = +-2 being outside the arch barrels) stand 0.6 m apart, so between z -3.4
    # and -1 one ceiling steps up to the other; this is the step face, two lobes
    # meeting where the barrels cross (z -2.2). MEASURED: a render from either walk
    # showed the sky through it.
    # The edges follow the vault MESHES (vault(): eight straight runs from z -4 to
    # -1, a chord under the true barrel), not the true curve, sampled at both
    # meshes' grid points -- a face cut to the curve left a sliver of sky under
    # the lower ceiling's chords. The barrels cross at z -2.2 by symmetry.
    def Bf(z): return VAULT_SP + math.sqrt(max(0, VAULT_R ** 2 - (z + 2.5) ** 2))
    grid = [-WALK + (WALK - PD) * j / 8 for j in range(9)]
    def Bm(z, dz=0.0):   # the vault mesh's height at z, for a vault shifted dz forward
        zz = min(max(z - dz, grid[0]), grid[-1])
        j = min(7, int((zz - grid[0]) / (grid[1] - grid[0])))
        f = (zz - grid[j]) / (grid[j + 1] - grid[j])
        return Bf(grid[j]) * (1 - f) + Bf(grid[j + 1]) * f
    za, zm, zb = -WALK + .6, -2.2, -PD
    for z0, z1 in ((za, zm), (zm, zb)):
        zs = sorted({round(z, 6) for z in [z0, z1] + grid + [g + .6 for g in grid] if z0 <= z <= z1})
        lo = [(z, min(Bm(z), Bm(z, .6)) - .01) for z in zs]; hi = [(z, max(Bm(z), Bm(z, .6))) for z in zs]
        prism('walk return vault', lo + hi[::-1], -t, t, 'Plaster', axis='x')


# ======================================================================== ROOFS
RD, RP = PLOT - .2, 22                # street roof: over the 14 m plot (inset .6 front, .4 overhang rear), pitch
RH = RD / 2 * math.tan(RAD(RP))
HALF_TILE = [(.12 * math.cos(math.pi * i / 6), .12 * math.sin(math.pi * i / 6) + .02) for i in range(7)] + [(-.12, -.03), (.12, -.03)]


def roof_run(w=BAY):
    """The street roof, one 4 m slice: the ridge runs ALONG the street so a whole row
    reads as one building under one roof, a lead gutter behind the balustrade. Centred
    on z = 0: placed at the entablature top, z = -7.5 (eaves at -0.6 and -14.4)."""
    hx, hz = w / 2, RD / 2
    quad('front slope', [(-hx, 0, hz), (hx, 0, hz), (hx, RH, 0), (-hx, RH, 0)], 'Honey', (0, 1, 1))
    quad('back slope', [(hx, 0, -hz), (-hx, 0, -hz), (-hx, RH, 0), (hx, RH, 0)], 'Honey', (0, 1, -1))
    sweep('ridge tile', HALF_TILE, [(Vector((-hx, RH, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))), (Vector((hx, RH, 0)), Vector((0, 0, 1)), Vector((0, 1, 0)))], 'Ridge')
    box('lead gutter', -hx, hx, -.02, .03, hz, hz + .45, 'Lead')


def roof_end():
    """A hipped end of the street roof at a corner house, spanning x 0..RD/2 inward
    from the row's end (x = 0); the far end uses it turned half round."""
    hz = RD / 2; e = hz
    P0, P1, Pk = (0, 0, hz), (0, 0, -hz), (e, RH, 0)
    quad('hip face', [P1, P0, Pk], 'Honey', (-1, 1, 0))
    quad('front tri', [P0, (e, 0, hz), Pk], 'Honey', (0, 1, 1))
    quad('back tri', [(e, 0, -hz), P1, Pk], 'Honey', (0, 1, -1))
    for a in (P0, P1):
        a, b = Vector(a), Vector(Pk); d = (b - a).normalized()
        side = d.cross(Vector((0, 1, 0))).normalized(); up = side.cross(d).normalized()
        if up.y < 0: up = -up
        sweep('hip tile', HALF_TILE, [(a, side, up), (b, side, up)], 'Ridge')
    box('lead gutter', 0, e, -.02, .03, hz, hz + .45, 'Lead')
    box('lead gutter side', -.45, 0, -.02, .03, -hz, hz + .45, 'Lead')


def chimney():
    """A party-wall stack on the ridge: rusticated, a moulded cap, two honey pots --
    short, so its pots stop under the curtain's parapet coping (decisions 13).
    Mounted .55 under the 14.49 m ridge (capital_blocks.ts), it tops out at 15.7
    against the coping's 16.2; the mock-up's 1.5 m stack reached 16.1."""
    box('stack', -.5, .5, 0, 1.2, -.38, .38, 'Rustic')
    box('stack cap', -.6, .6, 1.2, 1.36, -.48, .48, 'Trim', bevel=.015)
    for k in (-1, 1):
        lathe('pot', [(.13, 0, True), (.11, .1, False), (.09, .34, True), (.12, .38, True), (.12, .4, True), (0, .4, True)],
              'RoofStone', seg=8, cx=k * .24, cy=1.36)


def pc_pediment(W=12.6, slope=12, roof='Honey'):
    """A projecting centre's pediment (every 5th avenue house), standing on its
    entablature: raking cornices, the carved wreath, a short gabled honey roof behind
    so it is a real gable from the side and the air. Pitched at 12 deg (the mock-up's
    15) and with no apex acroterion, so the apex stops at ~13.5 m -- the one house
    element above the 12.5 m datum, every fifth house."""
    hx = W / 2; sl = RAD(slope); rise = hx * math.tan(sl)
    nl = Vector((-math.sin(sl), math.cos(sl), 0)); nr = Vector((math.sin(sl), math.cos(sl), 0))
    ext = .8
    pts = [Vector((-hx - ext, 0.0, 0)), Vector((0, rise + ext * math.tan(sl), 0)), Vector((hx + ext, 0.0, 0))]
    RK = [(0, 0), (.06, 0), (.06, .10), (.28, .10), (.28, .12), (.33, .18)] + cyma(.33, .18, .40, .28, 3) + [(.40, .32), (0, .32)]
    fr = []
    for i, p in enumerate(pts):
        Bv = nl if i == 0 else nr if i == 2 else (nl + nr) / (1 + nl.dot(nr))
        fr.append((p, Vector((0, 0, 1)), Bv))
    sweep('raking cornice', RK, fr, 'Trim')
    prism('tympanum', [(-hx + .2, .02), (hx - .2, .02), (0, rise - .08)], -.25, -.05, 'TympHouse')
    prism('tympanum back', [(-hx - ext, 0), (hx + ext, 0), (0, rise + ext * math.tan(sl))], -.6, -.25, 'Trim')
    top = rise + ext * math.tan(sl) + .25
    for s in (-1, 1):
        vs = [(0, top, -.3), (s * (hx + ext), .3, -.3), (s * (hx + ext), .3, -1.6), (0, top, -6.2)]
        quad('gable roof', vs, roof, (s * math.sin(sl), math.cos(sl), 0))
        # its underside: the eave stands 0.3 m off the entablature, and single-sided
        # the slot under it would show the sky through the roof
        quad('gable roof under', vs[::-1], 'Lead', (-s * math.sin(sl), -math.cos(sl), 0))
    for s in (-1, 1):   # low side acroteria: plinths only
        x = s * (hx + .3)
        box('acroterion', x - .3, x + .3, .12, .5, -.3, .3, 'Trim', bevel=.015)


def roof_deck(W=BAY, D=BAY):
    """Lead flat behind a projecting centre's pediment."""
    box('roof deck', -W / 2, W / 2, -.05, 0, -D, 0, 'Lead')


def belvedere():
    """A 4.4 m corner belvedere at junctions -- LOWERED to 15 m all told (decisions
    13: nothing on a house above the curtain's walk). Mounted at the avenue
    entablature's top (11.7), it can rise 3.3 m, and the hip roof under its back
    corner stands 1.7 m over the eave: so a plinth that swallows the hip to 13.45,
    a low lantern storey of square lights between corner piers, a cornice ring and
    a low honey pyramid -- the junction marker the direction wants, kept under the
    wall. The mock-up's open loggia on paired posts (18.7 m) cannot stand in 3.3 m."""
    hb = 2.2; P = 1.75
    box('plinth', -hb, hb, 0, P, -hb, hb, 'Ashlar')
    sq = [Vector((-hb, P, -hb)), Vector((hb, P, -hb)), Vector((hb, P, hb)), Vector((-hb, P, hb))]
    nr = [Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))]
    sweep('plinth cornice', [(0, -.06), (.08, -.06), (.14, .01), (.14, .08), (0, .08)], path_frames(sq, nr, closed=True), 'Trim', closed=True)
    f = P + .08; top = 2.86; hl = hb - .25
    box('lantern', -hl, hl, f, top, -hl, hl, 'Ashlar')
    for i in range(4):
        M = Matrix.Rotation(i * math.pi / 2, 4, 'Y')
        for x in (-.75, .75):
            # (L5: 'DarkR', lit on the returned city's nights only -- as 'Dark' every
            # belvedere burned all night over the empty city)
            quad('light', [(x - .32, f + .18, hl + .01), (x + .32, f + .18, hl + .01), (x + .32, top - .18, hl + .01), (x - .32, top - .18, hl + .01)], 'DarkR', (0, 0, 1), M=M)
        for x in (-hl + .2, 0, hl - .2):
            box('pier', x - .2, x + .2, f, top, hl - .02, hl + .1, 'Trim', bevel=.012, M=M)
    sq2 = [Vector((-hl, top, -hl)), Vector((hl, top, -hl)), Vector((hl, top, hl)), Vector((-hl, top, hl))]
    sweep('cornice ring', [(-.2, 0), (0, 0), (.08, .05), (.08, .1), (.22, .14), (.24, .2), (-.2, .2)], path_frames(sq2, nr, closed=True), 'Trim', closed=True)
    e = hl + .3; y0 = top + .2
    pk = 3.3 - .02   # 11.7 + 3.28: the finial-less apex just under 15 m
    corners = [(-e, y0, -e), (e, y0, -e), (e, y0, e), (-e, y0, e)]
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        quad('pyramid', [a, b, (0, pk, 0)], 'Honey', ((a[0] + b[0]) / 2, 1.2, (a[2] + b[2]) / 2))
    quad('pyramid soffit', corners, 'Trim', (0, -1, 0))


# ======================================================================== CIVIC ORDER
# the dome-lantern finial's profile (1 m tall at scale 1): base, neck, ball, spike
FINIAL = [(.22, 0, True), (.12, .2, False), (.1, .4, False), (.32, .62, False), (.4, .85, False),
          (.3, 1.08, False), (.07, 1.25, False), (.1, 1.35, False), (.04, 1.9, False), (0, 2.1, True)]
URN = [(.13, 0, True), (.13, .05, True), (.07, .09, True), (.06, .16, False), (.12, .24, False), (.21, .36, False), (.22, .42, False),
       (.17, .52, True), (.19, .55, True), (.19, .58, True), (.12, .60, True), (.08, .66, False), (.05, .74, False), (0, .78, True)]


def civic_column(H=10.0, D=1.3):
    """A 10 m civic column: Attic base, fluted shaft with entasis, and a chunky
    stylised Corinthian capital -- two tiers of eight acanthus leaves cut as real
    sheets, corner volutes, a concave-cornered abacus. LOD1 keeps the silhouette
    (base, shaft, flared bell, abacus) and drops the leaves, flutes and volutes."""
    r = D / 2
    box('plinth', -r * 1.36, r * 1.36, 0, .32, -r * 1.36, r * 1.36, 'Trim', bevel=.03)
    base = [(r * 1.24, .32, True)] + [(r * 1.24 + r * .1 * math.sin(math.pi * t), .32 + .18 * t, False) for t in (.33, .66, 1.0)]
    base += [(r * 1.12, .52, True), (r * 1.04, .58, False), (r * 1.06, .62, True)]
    base += [(r * 1.08 + r * .06 * math.sin(math.pi * t), .62 + .12 * t, False) for t in (.5, 1.0)]
    base += [(r * 1.02, .76, True), (r, .80, True)]
    shaft_top = H * .835
    shaft = [(r * (1 - .14 * max(0, (t - .33) / .67) ** 1.6), .80 + (shaft_top - .80) * t, False) for t in [i / 8 for i in range(1, 9)]]
    cap0 = shaft_top; rt = r * .86
    top = [(rt * 1.06, cap0 + .02, True), (rt * 1.06, cap0 + .10, True), (rt, cap0 + .12, True)]
    bell = [(rt * (1 + .22 * ((i / 4) ** 2)) * (1.12 if lod() else 1), cap0 + .12 + (H - .35 - cap0 - .12) * i / 4, False) for i in range(1, 5)]
    lathe('column', base + shaft + top + bell + [(0, H - .35, True)], 'Trim', seg=32, flutes=20, fdepth=.06, fy=(.85, shaft_top - .05))
    capH = H - .35 - cap0
    if not lod():
        for k in range(8):
            leaf_sheet('leaf', 0, 0, k * math.pi / 4, rt * 1.0, cap0 + .12, capH * .48, .5, .18, .14, 'Trim', rows=4)
        for k in range(8):
            leaf_sheet('leaf', 0, 0, k * math.pi / 4 + math.pi / 8, rt * 1.05, cap0 + .12 + capH * .22, capH * .55, .44, .2, .12, 'Trim', rows=4)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            rad = Vector((math.cos(a), 0, math.sin(a))); tan = Vector((-math.sin(a), 0, math.cos(a)))
            fr = []
            for i in range(9):
                t = i / 8; ang = math.pi * 1.6 * t; rr = .2 * (1 - .6 * t)
                p = Vector((0, cap0 + .12 + capH * .55, 0)) + rad * (rt * 1.15 + capH * .5 * t) + Vector((0, capH * .42 * t, 0))
                p += rad * rr * math.sin(ang) + Vector((0, -rr * (1 - math.cos(ang)), 0))
                fr.append((p, tan * (1 - .5 * t), Vector((0, 1, 0)) * (1 - .5 * t)))
            sweep('volute', [(-.09, -.07), (.09, -.07), (.09, .07), (-.09, .07)], fr, 'Trim')
    ab = r * 1.42; c = .28
    pts = [(-ab + c, -ab), (ab - c, -ab), (ab, -ab + c), (ab, ab - c), (ab - c, ab), (-ab + c, ab), (-ab, ab - c), (-ab, -ab + c)]
    prism('abacus', pts, H - .35, H, 'Trim', axis='y', bevel=.02)


def civic_entab(length=4.0, modillions=True, frieze=None):
    hl = length / 2
    sweep('civic entablature', CENT(), run_x(-hl, hl, 0), 'Trim')
    if lod():
        # LOD1 (the palace's shells beyond 45 m, L4): the profile alone -- the dentils
        # and modillions were two thirds of the triangles and none of the silhouette
        if frieze: quad('inscription', [(-hl + .4, .9, .085), (hl - .4, .9, .085), (hl - .4, 1.55, .085), (-hl + .4, 1.55, .085)], frieze, (0, 0, 1))
        return
    n = int(round(length / .25))
    for i in range(n):
        x = -hl + (i + .5) * length / n
        box('dentil', x - .065, x + .065, 1.76, 1.92, 0, .42, 'Trim')
    if modillions:
        for i in range(int(round(length / .8))):
            x = -hl + (i + .5) * length / round(length / .8)
            scroll_console('modillion', x, 1.8, 1.92, .95, .16, 'Trim', z0=.25)
    if frieze:
        quad('inscription', [(-hl + .4, .9, .085), (hl - .4, .9, .085), (hl - .4, 1.55, .085), (-hl + .4, 1.55, .085)], frieze, (0, 0, 1))


def crown_piece(y, s):
    """THE CROWN: a gilt band with ten points and pearls, four arches closing over it
    onto a plain gilt knop. No orb and no cross (the mock-up's cross-on-orb read
    Christian, compare.md): this court does appointments, not religion."""
    Rc = 1.15 * s
    lathe('crown band', [(Rc * .8, 0, True), (Rc, .25 * s, True), (Rc * 1.05, .3 * s, True), (Rc * 1.05, .7 * s, True), (Rc, .75 * s, True), (Rc * .9, .75 * s, True)], 'Gilt', seg=40, cy=y, caps=False)
    for k in range(10):
        a = 2 * math.pi * k / 10
        h = (1.25 if k % 2 == 0 else .85) * s
        M = Matrix.Translation(Vector((math.cos(a) * Rc, y + .72 * s, math.sin(a) * Rc))) @ Matrix.Rotation(-a + math.pi / 2, 4, 'Y')
        prism('crown point', [(-.3 * s, 0), (.3 * s, 0), (0, h)], -.06 * s, .06 * s, 'Gilt', M=M)
        if not lod():
            lathe('crown pearl', [(.0, -.16 * s, True)] + [(.15 * s * math.sin(math.pi * i / 6), -.16 * s + .32 * s * (1 - math.cos(math.pi * i / 6)) / 2, False) for i in range(1, 6)] + [(0, .16 * s, True)],
                  'Gilt', seg=8, M=M @ Matrix.Translation(Vector((0, h + .14 * s, 0))))
    if not lod():
        for k in range(4):
            a = k * math.pi / 2; fr = []
            for i in range(9):
                t = i / 8
                rr = Rc * (1 - t) * .98; yy = y + .75 * s + 1.0 * s * math.sin(math.pi / 2 * t)
                fr.append((Vector((math.cos(a) * rr, yy, math.sin(a) * rr)), Vector((-math.sin(a), 0, math.cos(a))),
                           Vector((math.cos(a) * math.sin(math.pi / 2 * t), math.cos(math.pi / 2 * t), math.sin(a) * math.sin(math.pi / 2 * t))).normalized()))
            sweep('crown arch', [(-.09 * s, -.06 * s), (.09 * s, -.06 * s), (.09 * s, .06 * s), (-.09 * s, .06 * s)], fr, 'Gilt')
    ky = y + 1.68 * s   # the knop where the arches meet: a neutral turned bud
    lathe('knop', [(0, 0, True), (.16 * s, .06 * s, False), (.22 * s, .2 * s, False), (.17 * s, .36 * s, False), (.07 * s, .5 * s, False),
                   (.09 * s, .56 * s, True), (.04 * s, .62 * s, False), (0, .78 * s, True)], 'Gilt', seg=12, cy=ky)


def hall_pediment(W=23.2, slope=15, tymp='TympHall', palace=False, urn=False):
    """The Census Hall's pediment: raking civic cornices, the tympanum carved with the
    crown over the ruled grid between two open census rolls, a copper gable roof back
    to the cella, acroteria. The centre acroterion is a plain gilt finial on the Hall
    (the crown is carved in its tympanum) and a copper urn on the palace: the one
    modelled crown is the palace lantern's, the brightest point of the city. The
    small fronts (`urn`: the Archive's and the Chapel's) carry a stone urn, the
    side acroteria's own: the Hall's finial, 3.4 m of gilt bud and spike sized for
    its 23.2 m front, read on a 14.6 m one as an orb and spike over the Chapel --
    the cue its civic set avoids -- and stacked with the dome lantern's (L3 review)."""
    hx = W / 2; sl = RAD(slope); rise = hx * math.tan(sl)
    nl = Vector((-math.sin(sl), math.cos(sl), 0)); nr = Vector((math.sin(sl), math.cos(sl), 0))
    RK = [(0, 0), (.08, 0), (.08, .16), (.30, .16), (1.0, .18), (1.02, .2), (1.02, .36)] + cyma(1.02, .36, 1.14, .56, 4) + [(1.14, .62), (0, .62)]
    ext = 1.25
    pts = [Vector((-hx - ext, 0, 0)), Vector((0, rise + ext * math.tan(sl), 0)), Vector((hx + ext, 0, 0))]
    fr = []
    for i, p in enumerate(pts):
        Bv = nl if i == 0 else nr if i == 2 else (nl + nr) / (1 + nl.dot(nr))
        fr.append((p, Vector((0, 0, 1)), Bv))
    sweep('raking cornice', RK, fr, 'Trim')
    prism('tympanum', [(-hx + .3, .02), (hx - .3, .02), (0, rise - .12)], -.5, -.25, tymp)
    prism('tympanum back', [(-hx - ext, 0), (hx + ext, 0), (0, rise + ext * math.tan(sl))], -1.2, -.5, 'Trim')
    top = rise + ext * math.tan(sl) + .55
    for s in (-1, 1):
        vs = [(0, top, -.4), (s * (hx + ext), .6, -.4), (s * (hx + ext), .6, -8.0), (0, top, -8.0)]
        quad('portico roof', vs, 'Copper', (s * math.sin(sl), math.cos(sl), 0))
        quad('portico roof under', vs[::-1], 'Lead', (-s * math.sin(sl), -math.cos(sl), 0))
    sweep('roof ridge', [(-.16, -.05), (.16, -.05), (.12, .12), (-.12, .12)],
          [(Vector((0, top, -.3)), Vector((1, 0, 0)), Vector((0, 1, 0))), (Vector((0, top, -8.0)), Vector((1, 0, 0)), Vector((0, 1, 0)))], 'CopperRib')
    # the gable's rear end over the roof terrace (K3): open, the terrace and the
    # air looked in under the copper (LOOKED, the K3 aerial)
    quad('gable rear', [(hx + ext, .6, -8.0), (-hx - ext, .6, -8.0), (0, top, -8.0)], 'Trim', (0, 0, -1))
    for s in (-1, 1):
        x = s * (hx + .3); y = .62
        box('acroterion base', x - .55, x + .55, y, y + .8, -.55, .55, 'Trim', bevel=.02)
        lathe('acroterion urn', [(r * 2.4, yy * 2.4 + y + .8, h) for r, yy, h in URN], 'Trim', seg=12, cx=x)
    y = rise + .6
    box('crown plinth', -.8, .8, y, y + .5, -.6, .6, 'Trim', bevel=.02)
    box('crown plinth cap', -.9, .9, y + .5, y + .62, -.7, .7, 'Trim', bevel=.015)
    if palace: lathe('acroterion urn', [(r * 2.6, yy * 2.6 + y + .62, h) for r, yy, h in URN], 'Copper', seg=12)
    elif urn: lathe('acroterion urn', [(r * 2.4, yy * 2.4 + y + .62, h) for r, yy, h in URN], 'Trim', seg=12)
    else: lathe('finial', [(r * 1.6, yy * 1.6, h) for r, yy, h in FINIAL], 'Gilt', seg=16, cy=y + .62)


def brazier(lit=True):
    """A civic brazier: stepped pedestal, verdigris tripod bowl, and in the returned
    city a stylised flame (CL_Glow, lit at night: capital-architecture.ts nightGlow).
    `lit` False is the empty city's (brazier_cold): no flame -- an unlit CL_Glow cone
    read as a white teardrop in a cold bowl (K3 review) -- but grey ash heaped in the
    bowl and a few dead coals on it."""
    box('pedestal', -.42, .42, 0, .9, -.42, .42, 'Trim', bevel=.02)
    box('pedestal cap', -.5, .5, .9, 1.02, -.5, .5, 'Trim', bevel=.015)
    for k in range(3):
        a = 2 * math.pi * k / 3; fr = []
        for i in range(7):
            t = i / 6
            fr.append((Vector((math.cos(a) * (.36 - .18 * t), 1.02 + .9 * t, math.sin(a) * (.36 - .18 * t))), Vector((-math.sin(a), 0, math.cos(a))), Vector((math.cos(a), .2, math.sin(a))).normalized()))
        sweep('tripod leg', [(-.035, -.035), (.035, -.035), (.035, .035), (-.035, .035)], fr, 'CopperRib')
    lathe('bowl', [(.12, 1.8, True), (.42, 1.92, False), (.6, 2.1, True), (.64, 2.16, True), (.56, 2.16, True), (0, 2.02, True)], 'CopperRib', seg=16)
    if lit:
        lathe('flame', [(.3, 2.08, True), (.4, 2.28, False), (.3, 2.55, False), (.12, 2.85, False), (0, 3.1, True)], 'Glow', seg=10, phase=.3)
        return
    # the ash fills the bowl to just under its lip (2.16), mounded to the middle
    lathe('ash', [(.57, 2.12, True), (.34, 2.18, False), (0, 2.21, True)], 'Lead', seg=16)
    for x, z, a in ((-.16, .1, .4), (.14, -.05, 1.3), (.02, .2, 2.2)):
        box('coal', -.07, .07, 0, .07, -.05, .05, 'Soil', M=Matrix.Translation(Vector((x, 2.17, z))) @ Matrix.Rotation(a, 4, 'Y'))


def cella_bay(H=10.0, w=4.0, door=False, leaf=True, plinth=True):
    """The Census Hall's walls: blind arcading -- a tall round-headed recess per bay
    with an archivolt and a GILT civic keystone, giant flat pilasters at the joints.
    `leaf` False is the great door standing open (cella_door_open): no leaf in the
    opening, so the slab's piers -- boxes -- show their inner faces as the reveal.
    `plinth` False leaves the base moulding to the caller (the chapel's rotunda runs
    one mitred plinth round all its facets: a straight one per facet left a notch
    at every angle)."""
    hw = w / 2
    aw, ab, sp = (1.7, 0.0, 6.2) if door else (1.15, .9, 6.4)
    arch_wall('cella', -hw, hw, aw, ab, sp, H, 0, .6, 'Ashlar', soffit_surf='Trim', back=False, n=14)
    nf = 12
    def head(z, surf):
        vs = [(0, sp, z)] + [(aw * math.cos(math.pi * i / nf), sp + aw * math.sin(math.pi * i / nf), z) for i in range(nf + 1)]
        mesh('head', vs, [(0, i, i + 1) for i in range(1, nf + 1)], surf, facing=(0, 0, 1))
    if door:
        if leaf: quad('great door', [(-aw, 0, -.45), (aw, 0, -.45), (aw, sp, -.45), (-aw, sp, -.45)], 'Door', (0, 0, 1))
        head(-.45, 'Fan')
        box('threshold', -aw - .3, aw + .3, 0, .1, -.6, .4, 'Trim', bevel=.02)
    else:
        quad('recess back', [(-aw, ab, -.6), (aw, ab, -.6), (aw, sp, -.6), (-aw, sp, -.6)], 'Ashlar', (0, 0, 1))
        head(-.6, 'Plaster')
        box('recess sill', -aw - .15, aw + .15, ab - .12, ab, -.6, .12, 'Trim', bevel=.015)
        box('tablet', -aw + .25, aw - .25, 2.6, 4.3, -.6, -.5, 'Trim', bevel=.02)
    AV = [(0, 0), (.06, 0), (.06, .14), (.10, .16), (.10, .30), (.15, .33), (.15, .42), (.06, .46), (0, .46)]
    sweep('archivolt', AV, arc_frames(0, sp, aw, 0, math.pi, 14), 'Trim')
    sweep('impost', STRING(), run_x(-hw + .4, -aw, sp - .2), 'Trim'); sweep('impost', STRING(), run_x(aw, hw - .4, sp - .2), 'Trim')
    prism('gilt keystone', [(-.22, sp + aw), (.22, sp + aw), (.32, sp + aw + .75), (-.32, sp + aw + .75)], -.05, .24, 'Gilt', bevel=.015)
    for s in (-1, 1):
        xa, xb = sorted((s * (hw - .4), s * hw))
        box('giant pilaster', xa, xb, .5, H - .45, 0, .14, 'Trim')
        ei = lambda e: (xa - e, xb) if s > 0 else (xa, xb + e)
        box('pilaster base', *ei(.06), 0, .5, 0, .22, 'Trim')
        box('pilaster capital', *ei(.08), H - .45, H - .25, 0, .24, 'Trim')
        box('pilaster abacus', *ei(.1), H - .25, H, 0, .28, 'Trim')
    if plinth: sweep('plinth', CELLA_PLINTH(), run_x(-hw, hw, 0), 'Trim')


def CELLA_PLINTH(): return [(0, 0), (.25, 0), (.25, .35), (.18, .42)] + cyma(.18, .42, .06, .55, 3) + [(0, .55)]


def podium(W, D, H=1.6, steps=9, flags=False):
    """A civic podium: moulded base and cornice, a full-width flight on the +z face
    between cheek blocks. `flags` lays dressed flags over its whole top (L3: the
    Archive's and the Chapel's tops are walked all round, and the rusticated top
    laid flat reads as planks -- the Hall's has its portico floor instead)."""
    hx = W / 2
    box('podium', -hx, hx, 0, H, -D, 0, 'Rustic')
    if flags: box('podium flags', -hx + .02, hx - .02, H - .05, H + .02, -D + .02, 0, 'Ashlar')
    fr = path_frames([Vector((-hx, 0, 0)), Vector((-hx, 0, -D)), Vector((hx, 0, -D)), Vector((hx, 0, 0))], [Vector((-1, 0, 0)), Vector((0, 0, -1)), Vector((1, 0, 0))])
    sweep('podium base', [(0, 0), (.25, 0), (.25, .3)] + cyma(.25, .3, .05, .45, 3) + [(0, .45)], fr, 'Trim')
    fr2 = path_frames([Vector((-hx, H - .4, 0)), Vector((-hx, H - .4, -D)), Vector((hx, H - .4, -D)), Vector((hx, H - .4, 0))], [Vector((-1, 0, 0)), Vector((0, 0, -1)), Vector((1, 0, 0))])
    sweep('podium cornice', [(0, 0), (.06, 0)] + cyma(.06, 0, .2, .2, 3) + [(.22, .3), (.22, .4), (0, .4)], fr2, 'Trim')
    rise = H / steps; tread = .42
    for i in range(steps):
        box('step', -hx + .9, hx - .9, i * rise, (i + 1) * rise, 0, tread * (steps - i), 'Trim', bevel=.012)
    for s in (-1, 1):
        x = s * (hx - .45)
        box('cheek', x - .45, x + .45, 0, H + .25, 0, tread * steps, 'Ashlar', bevel=.02)
        box('cheek cap', x - .52, x + .52, H + .25, H + .4, -.05, tread * steps + .07, 'Trim', bevel=.02)


def dome_kit(Rd=8.0, drumH=6.0, nwin=12, ribs=16, crown=False, lantern_r=None, win='GlassDrum', lantern='DarkR'):
    """Drum + ribbed verdigris dome + lantern, parametric by radius: twelve drum bays of
    a tall round-headed window between paired pilasters (one per month of the palace
    calendar), a drum cornice and attic step, a raised dome with 16 standing ribs, a
    lantern of 8 arched openings, a small dome and a gilt finial -- or, on the palace
    (`crown`), gilt window keys and no finial: the GOLD CROWN is a module of its own
    (palace_crown), set on the lantern's top -- this returns that height -- so its
    gilt can burn at night alone. LOD1 (the Burned Land's view) keeps every
    silhouette element.
    `win` is the drum's glazing and `lantern` the lantern's core. The brief (section 4,
    decisions 7): the empty city's night lights "only the chapel lamps and the crown
    glow" -- so a lantern core is 'DarkR', lit on the returned city's nights only (the
    whole skyline then burns), and the chapel's drum and lantern are 'Dark', the lamp
    texel lit in both cities, as its lamps. The crown is its own module (palace_crown)."""
    s = Rd / 8.0
    lathe('drum plinth', [(Rd + .35 * s, 0, True), (Rd + .35 * s, .5 * s, True), (Rd + .15 * s, .7 * s, False), (Rd, .85 * s, True), (Rd, .86 * s, True), (0, .86 * s, True)], 'Trim', seg=48)
    lathe('drum', [(Rd, .8 * s, True), (Rd, drumH, True), (0, drumH, True)], 'Ashlar', seg=48, caps=False)
    ww = .75 * s; wy0 = 1.4 * s; wsp = drumH - 1.6 * s
    for k in range(nwin):
        a = 2 * math.pi * (k + .5) / nwin
        M = Matrix.Translation(Vector((math.cos(a) * Rd, 0, math.sin(a) * Rd))) @ Matrix.Rotation(-a + math.pi / 2, 4, 'Y')
        na = 4 if lod() else 10
        pts = [(-ww, wy0, .03)] + [(ww * math.cos(math.pi - math.pi * i / na), wsp + ww * math.sin(math.pi - math.pi * i / na), .03) for i in range(na + 1)] + [(ww, wy0, .03)]
        mesh('drum window', pts, [tuple(range(len(pts)))[::-1]], win, M=M, facing=(0, 0, 1))
        if not lod():
            sweep('window frame', [(0, 0), (.08 * s, 0), (.08 * s, .14 * s), (.04 * s, .2 * s), (0, .2 * s)], face_frame(-ww, ww, wy0, wsp, .02, arch=True, nseg=8), 'Trim', M=M)
            box('window sill', -ww - .12 * s, ww + .12 * s, wy0 - .12 * s, wy0, 0, .2 * s, 'Trim', M=M, bevel=.015)
            prism('window key', [(-.12 * s, wsp + ww), (.12 * s, wsp + ww), (.17 * s, wsp + ww + .4 * s), (-.17 * s, wsp + ww + .4 * s)], 0, .22 * s, 'Gilt' if crown else 'Trim', M=M)
        a2 = 2 * math.pi * k / nwin
        M2 = Matrix.Translation(Vector((math.cos(a2) * Rd, 0, math.sin(a2) * Rd))) @ Matrix.Rotation(-a2 + math.pi / 2, 4, 'Y')
        if lod():
            box('drum pilaster', -.62 * s, .62 * s, .85 * s, drumH - .2 * s, 0, .2 * s, 'Trim', M=M2)
        else:
            for p in (-1, 1):
                x = p * .42 * s
                box('drum pilaster', x - .2 * s, x + .2 * s, .85 * s, drumH - .45 * s, 0, .2 * s, 'Trim', M=M2)
                box('pilaster cap', x - .26 * s, x + .26 * s, drumH - .45 * s, drumH - .2 * s, 0, .28 * s, 'Trim', M=M2, bevel=.015)
    cor = [(Rd, drumH - .02, True), (Rd + .12 * s, drumH, True), (Rd + .12 * s, drumH + .25 * s, True), (Rd + .3 * s, drumH + .35 * s, False),
           (Rd + .72 * s, drumH + .55 * s, True), (Rd + .72 * s, drumH + .8 * s, True), (Rd + .82 * s, drumH + .9 * s, False), (Rd + .86 * s, drumH + 1.0 * s, True), (Rd - .1 * s, drumH + 1.0 * s, True)]
    lathe('drum cornice', cor, 'Trim', seg=48, caps=False)
    att0 = drumH + 1.0 * s
    lathe('dome attic', [(Rd - .1 * s, att0, True), (Rd - .1 * s, att0 + .9 * s, True), (Rd - .02 * s, att0 + .95 * s, True), (Rd - .02 * s, att0 + 1.1 * s, True), (Rd - .45 * s, att0 + 1.12 * s, True)], 'Ashlar', seg=48, caps=False)
    d0 = att0 + 1.1 * s; Rs = Rd - .45 * s
    Hd = Rs * 1.08; Rl = lantern_r or 1.5 * s
    prof = []
    N = 8 if lod() else 16
    for i in range(N + 1):
        el = (math.pi / 2) * i / N
        rr = Rs * math.cos(el); yy = d0 + Hd * math.sin(el)
        if rr < Rl: break
        prof.append((rr, yy, False))
    yl = d0 + Hd * math.sin(math.acos(Rl / Rs))
    prof.append((Rl, yl, True)); prof[0] = (prof[0][0], prof[0][1], True)
    lathe('dome shell', prof, 'Copper', seg=ribs * 4, caps=False, urep=ribs * 2)
    for k in range(ribs):
        a = 2 * math.pi * k / ribs
        rad = Vector((math.cos(a), 0, math.sin(a))); tan = Vector((-math.sin(a), 0, math.cos(a)))
        fr = []; nfr = 6 if lod() else 15
        for i in range(nfr):
            el = (math.pi / 2) * i / (nfr - 1) * (math.asin(min(1, (yl - d0) / Hd)) / (math.pi / 2))
            rr = Rs * math.cos(el); yy = d0 + Hd * math.sin(el)
            nrm = Vector((math.cos(el) / Rs * rad.x, math.sin(el) / Hd, math.cos(el) / Rs * rad.z)).normalized()
            fr.append((Vector((0, yy, 0)) + rad * rr, tan, nrm))
        w = .16 * s
        sweep('rib', [(-w, -.05), (w, -.05), (0, .2 * s)] if lod() else [(-w, -.05), (w, -.05), (w * .8, .14 * s), (0, .2 * s), (-w * .8, .14 * s)], fr, 'CopperRib')
    L0 = yl - .1
    lathe('lantern base', [(Rl + .25 * s, L0, True), (Rl + .25 * s, L0 + .35 * s, True), (Rl, L0 + .45 * s, True), (0, L0 + .45 * s, True)], 'Trim', seg=24)
    Lh = 2.6 * s; ly0 = L0 + .45 * s
    lathe('lantern core', [(Rl - .35 * s, ly0, True), (Rl - .35 * s, ly0 + Lh, True), (0, ly0 + Lh, True)], lantern, seg=16, caps=False)
    for k in range(8):
        a = 2 * math.pi * k / 8
        M = Matrix.Translation(Vector((math.cos(a) * (Rl - .2 * s), 0, math.sin(a) * (Rl - .2 * s)))) @ Matrix.Rotation(-a + math.pi / 2, 4, 'Y')
        box('lantern pier', -.2 * s, .2 * s, ly0, ly0 + Lh, -.2 * s, .2 * s, 'Trim', M=M, bevel=.012)
        a3 = a + math.pi / 8
        ch = 2 * (Rl - .2 * s) * math.sin(math.pi / 8) / 2 - .2 * s
        M3 = Matrix.Translation(Vector((math.cos(a3) * (Rl - .2 * s) * math.cos(math.pi / 8), 0, math.sin(a3) * (Rl - .2 * s) * math.cos(math.pi / 8)))) @ Matrix.Rotation(-a3 + math.pi / 2, 4, 'Y')
        fan('lantern arch', 0, ly0 + Lh - .9 * s - ch, ch, -ch - .02, ch + .02, ly0 + Lh, 0, 'Trim', (0, 0, 1), n=6, M=M3)
    lathe('lantern cornice', [(Rl + .05 * s, ly0 + Lh, True), (Rl + .3 * s, ly0 + Lh + .2 * s, False), (Rl + .3 * s, ly0 + Lh + .35 * s, True), (Rl * .9, ly0 + Lh + .4 * s, True), (0, ly0 + Lh + .4 * s, True)], 'Trim', seg=24)
    md0 = ly0 + Lh + .4 * s
    mprof = [(Rl * .9 * math.cos(math.pi / 2 * i / 8), md0 + Rl * math.sin(math.pi / 2 * i / 8), i in (0, 8)) for i in range(9)]
    mprof[-1] = (0, mprof[-1][1], True)
    lathe('lantern dome', mprof, 'Copper', seg=24)
    ft = md0 + Rl
    if not crown: lathe('finial', [(r * s, yy * s, h) for r, yy, h in FINIAL], 'Gilt', seg=16, cy=ft - .05)
    return ft


def fountain():
    """The square's fountain: moulded basin, pedestal bowl, and an ARMILLARY SPHERE in
    verdigris -- the survey and the calendar, the empire's two instruments.
    LOWERED (M1, the L look pass): on its old 3.8 m stem the sphere's centre stood
    at 4.9 m, exactly on the gate-to-crown axis, and from the gate court it covered
    the Great Stair and the portico's door (128 m on, it subtended the stair's whole
    height). It now sits low on a short collar, a smaller instrument (rings 0.8 m,
    centre 3.5 m, its top at 4.4), so from the gate the stair's head and the
    portico read over and through its open rings."""
    R0 = 5.2
    lathe('basin', [(R0, 0, True), (R0, .15, True), (R0 + .08, .2, True), (R0 + .08, .55, False), (R0 + .02, .62, True), (R0 + .18, .7, False),
                    (R0 + .18, .78, True), (R0 - .35, .78, True), (R0 - .35, .5, True), (0, .5, True)], 'Trim', seg=48)
    lathe('water', [(R0 - .35, 0, True), (0, 0, True)], 'Water', seg=48, cy=.62)
    lathe('pedestal', [(1.0, .5, True), (1.0, .7, True), (.7, .9, False), (.55, 1.2, True), (.42, 1.5, False), (.38, 2.0, False), (.55, 2.2, True),
                       (1.6, 2.45, False), (1.9, 2.6, True), (1.9, 2.75, True), (1.6, 2.75, True), (1.5, 2.6, True), (0, 2.6, True)], 'Trim', seg=32)
    lathe('bowl water', [(1.5, 0, True), (0, 0, True)], 'Water', seg=32, cy=2.7)
    lathe('collar', [(.3, 2.6, True), (.22, 2.68, False), (.16, 2.72, True), (.24, 2.78, True), (0, 2.8, True)], 'Trim', seg=16)
    c = Vector((0, 3.5, 0)); Ra = .8
    for k, (ax, ang) in enumerate([('X', 0), ('X', math.pi / 2), ('Z', math.pi / 2), ('X', RAD(23.4))]):
        prof = [(Ra + .06 * math.cos(2 * math.pi * i / 6), .06 * math.sin(2 * math.pi * i / 6), False) for i in range(7)]
        lathe('ring', prof, 'CopperRib' if k < 3 else 'Gilt', seg=32, M=Matrix.Translation(c) @ Matrix.Rotation(ang, 4, ax), caps=False)
    lathe('globe', [(0, -.22, True)] + [(.22 * math.sin(math.pi * i / 8), -.22 + .44 * (1 - math.cos(math.pi * i / 8)) / 2, False) for i in range(1, 8)] + [(0, .22, True)], 'Gilt', seg=16, cy=3.5)
    box('axis', -.03, .03, 2.72, 4.35, -.03, .03, 'Bronze', M=Matrix.Translation(c) @ Matrix.Rotation(RAD(23.4), 4, 'X') @ Matrix.Translation(-c))


def banner(surf='Banner'):
    """A banner hung between portico columns: the Household's (white, the gold crown)
    in both cities; the returned city adds the three courts' (BannerCaer, BannerHeart,
    BannerMoon). The rod is bronze -- gilt is kept to the crown, dome finials and
    civic keystones (the direction's rule)."""
    box('rod', -1.15, 1.15, 6.0, 6.08, -.04, .04, 'Bronze')
    for s in (-1, 1): lathe('rod knob', [(.06, 0, True), (.08, .05, False), (0, .1, True)], 'Bronze', seg=8, cx=s * 1.18, cy=5.99)
    vs = [(-1.0, 0.0, 0), (1.0, 0.0, 0), (1.0, 6.0, 0), (-1.0, 6.0, 0)]
    quad('banner', vs, surf, (0, 0, 1)); quad('banner back', vs[::-1], surf, (0, 0, -1))


def coffers(w=4.0, d=4.0):
    """A portico ceiling panel: lime soffit with a grid of deep coffers."""
    quad('soffit', [(-w / 2, 0, d / 2), (w / 2, 0, d / 2), (w / 2, 0, -d / 2), (-w / 2, 0, -d / 2)][::-1], 'Plaster', (0, -1, 0))
    for i in range(3):
        x = -w / 2 + i * w / 2; box('beam x', x - .14, x + .14, -.34, 0, -d / 2, d / 2, 'Trim')
        z = -d / 2 + i * d / 2; box('beam z', -w / 2, w / 2, -.34, 0, z - .14, z + .14, 'Trim')
    for i in range(2):
        for j in range(2):
            lathe('rosette', [(.14, 0, True), (.1, -.05, False), (0, -.08, True)], 'Gilt', seg=8, cx=-w / 4 + i * w / 2, cz=-d / 4 + j * d / 2)


# ======================================================================== STREET AND COURT SET
def lamp():
    """A 5 m bronze lamp standard with three lanterns on a stone pedestal; the
    lantern glass is CL_Glow (lit by the runtime at night, no new lights)."""
    box('base', -.36, .36, 0, .2, -.36, .36, 'Trim', bevel=.02)
    box('die', -.28, .28, .2, .95, -.28, .28, 'Trim', bevel=.02)
    box('cap', -.33, .33, .95, 1.05, -.33, .33, 'Trim', bevel=.015)
    prof = [(.15, 1.05, True), (.15, 1.15, True), (.10, 1.25, False), (.075, 1.4, True)]
    for i in range(5): prof.append((.075 - .02 * i / 4, 1.4 + 2.6 * i / 4, False))
    prof += [(.07, 4.05, True), (.09, 4.1, True), (.09, 4.18, True), (.05, 4.22, True), (.05, 4.6, False), (0, 4.62, True)]
    lathe('pole', prof, 'Bronze', seg=10, flutes=5, fdepth=.12, fy=(1.45, 3.95))
    for s in (-1, 1):
        fr = []
        for i in range(7):
            t = i / 6
            p = Vector((s * .75 * t, 4.12 + .3 * math.sin(math.pi * t * .9), 0))
            d = Vector((s * .75, .3 * math.pi * .9 * math.cos(math.pi * t * .9), 0)).normalized()
            fr.append((p, Vector((0, 0, 1)), Vector((-d.y, d.x, 0))))
        sweep('arm', [(-.025, -.025), (.025, -.025), (.025, .025), (-.025, .025)], fr, 'Bronze')
    for x, y in ((-.75, 4.1), (.75, 4.1), (0, 4.62)):
        lathe('lantern base', [(.06, 0, True), (.13, .06, True), (.13, .1, True), (0, .1, True)], 'Bronze', seg=8, cx=x, cy=y - .1)
        lathe('lantern glass', [(.12, 0, True), (.15, .38, True), (0, .38, True)], 'Glow', seg=8, cx=x, cy=y)
        lathe('lantern cap', [(.19, 0, True), (.19, .04, True), (.07, .18, False), (.03, .26, True), (.05, .3, True), (0, .34, True)], 'Bronze', seg=8, cx=x, cy=y + .38)


def planter():
    """A moulded stone tree box. The tree is NOT modelled here: the avenue plants the
    project's own generated broadleaf (nature/CommonTree_1..5 -> trees.ts) in it, at
    the scale in manifest.json -- five irregular crowns with their own LOD and wind,
    instead of the mock-up's mirror-identical lollipops (compare.md)."""
    box('box', -.62, .62, 0, .7, -.62, .62, 'Trim', bevel=.02)
    box('box rim', -.7, .7, .7, .82, -.7, .7, 'Trim', bevel=.02)
    box('box foot', -.68, .68, 0, .1, -.68, .68, 'Trim', bevel=.015)
    box('soil', -.6, .6, .76, .8, -.6, .6, 'Soil')


def bench():
    for s in (-1, 1): scroll_console('bench leg', s * .8, 0, .42, .45, .12, 'Trim', z0=-.22)
    box('seat', -1.0, 1.0, .42, .52, -.25, .25, 'Trim', bevel=.02)


def chair(x, z, yaw):
    M = Matrix.Translation(Vector((x, 0, z))) @ Matrix.Rotation(yaw, 4, 'Y')
    box('chair seat', -.22, .22, .44, .49, -.24, .2, 'Wood', M=M, bevel=.01)
    for lx in (-.19, .19):
        for lz in (-.21, .17):
            box('chair leg', lx - .025, lx + .025, 0, .44, lz - .025, lz + .025, 'Wood', M=M)
        box('chair stile', lx - .03, lx + .03, .49, 1.02, .15, .2, 'Wood', M=M)
    box('chair rail', -.22, .22, .9, 1.0, .15, .2, 'Wood', M=M, bevel=.01)
    box('chair splat', -.08, .08, .52, .9, .16, .19, 'Wood', M=M)


def feast_table():
    """EMPTY city: one festival table -- Philip's ruling 11: a separate table, never an
    end-to-end run, four chairs a side at most (2.6 m, eight places), set like a
    table: linen with a gold border, plates, gilt goblets, candles unlit, every chair
    pushed in. Origin at the table's centre on the floor, long axis along x; the
    footprint with chairs is 2.8 x 2.1 m. Placement keeps it clear of door bays."""
    Lh, Wd, y = 1.3, .45, .76
    box('cloth top', -Lh, Lh, y - .03, y, -Wd, Wd, 'Cloth')
    for s in (-1, 1):
        v = [(-Lh, y - .32, s * (Wd + .01)), (Lh, y - .32, s * (Wd + .01)), (Lh, y, s * (Wd + .01)), (-Lh, y, s * (Wd + .01))]
        quad('cloth drop', v, 'Cloth', (0, 0, s)); quad('cloth drop in', v[::-1], 'Cloth', (0, 0, -s))
        e = [(s * (Lh + .01), y - .32, -Wd), (s * (Lh + .01), y - .32, Wd), (s * (Lh + .01), y, Wd), (s * (Lh + .01), y, -Wd)]
        quad('cloth end', e, 'Cloth', (s, 0, 0)); quad('cloth end in', e[::-1], 'Cloth', (-s, 0, 0))
    for lx in (-Lh + .1, Lh - .1):
        for lz in (-Wd + .1, Wd - .1): box('table leg', lx - .04, lx + .04, 0, y - .32, lz - .04, lz + .04, 'Wood')
    for i in range(4):
        x = -.975 + .65 * i
        for s in (-1, 1):
            z = s * .27
            lathe('plate', [(.15, 0, True), (.16, .015, True), (.12, .02, True), (0, .012, True)], 'Ceramic', seg=12, cx=x, cy=y, cz=z)
            # bronze, not gilt: gilt is the crown's, the dome finials' and the civic keystones'
            lathe('goblet', [(.035, 0, True), (.01, .02, True), (.01, .08, False), (.035, .1, False), (.04, .17, True), (0, .15, True)], 'Bronze', seg=8, cx=x + .2, cy=y, cz=z - s * .08)
            chair(x, s * .62, 0 if s > 0 else math.pi)
    for x in (-.65, .65):
        lathe('candlestick', [(.07, 0, True), (.07, .02, True), (.025, .06, False), (.02, .22, False), (.045, .26, True), (.03, .28, True), (0, .28, True)], 'Bronze', seg=8, cx=x, cy=y)
        lathe('candle', [(.018, 0, True), (.018, .2, True), (0, .21, True)], 'Candle', seg=6, cx=x, cy=y + .28)


def market():
    """RETURNED city: goods stacked under the arcade -- crates, a barrel, cloth bolts
    (in the arcade frame: against the house front at z = -3.4)."""
    for x, z, h in [(-1.2, -3.4, .5), (-0.6, -3.5, .4), (-1.0, -3.35, .9), (1.1, -3.4, .55)]:
        box('crate', x - .3, x + .3, h - .45 if h > .6 else 0, h, z - .28, z + .28, 'Wood', bevel=.015)
    lathe('barrel', [(.26, 0, True), (.31, .35, False), (.26, .7, True), (0, .7, True)], 'Wood', seg=12, cx=.35, cz=-3.4)
    for k in range(3):
        lathe('bolt', [(.09, 0, True), (.09, .9, True), (0, .9, True)], 'Canvas', seg=8, cx=1.5, cy=.02, cz=-2.9 - k * .2)


def produce(x0, x1, z0, z1, y, seed):
    """Goods on a counter: a row of shallow baskets heaped with fruit and greens, a
    stack of loaves, two jars -- the morning's market, M1 (the L look pass: "the
    returned square's stalls are bare counters with no goods")."""
    r = [seed]
    def rnd():
        r[0] = (r[0] * 1103515245 + 12345) % 2147483648
        return r[0] / 2147483648
    n = max(2, int((x1 - x0) / .62))
    for i in range(n):
        cx = x0 + (x1 - x0) * (i + .5) / n; cz = (z0 + z1) / 2
        kind = ('Fruit', 'Greens', 'Fruit', 'Bread')[i % 4]
        lathe('basket', [(.19, 0, True), (.25, .1, True), (.23, .11, True), (0, .11, True)], 'Wood', seg=10, cx=cx, cy=y, cz=cz)
        if kind == 'Bread':
            for k in range(3):
                box('loaf', cx - .17, cx + .17, y + .1 + .07 * k, y + .17 + .07 * k, cz - .08 + .03 * (k % 2), cz + .08 + .03 * (k % 2), 'Bronze', bevel=.02)
            continue
        for k in range(5):
            a = 2 * math.pi * k / 5 + rnd(); rr = .1 if k else 0
            rad = .07 if kind == 'Fruit' else .09
            lathe('heap', [(0, -rad, True)] + [(rad * math.sin(math.pi * j / 4), -rad * math.cos(math.pi * j / 4), False) for j in range(1, 4)] + [(0, rad, True)],
                  kind, seg=6, cx=cx + rr * math.cos(a), cy=y + .1 + rad + (.05 if k == 0 else 0), cz=cz + rr * math.sin(a))
    for k, jx in enumerate((x1 + .05, x1 - .2)):
        lathe('jar', [(.07, 0, True), (.1, .06, False), (.1, .18, False), (.06, .24, True), (.07, .27, True), (0, .27, True)], 'Ceramic', seg=8, cx=jx - .1 * k, cy=y, cz=z1 - .12)


def stall():
    """RETURNED city: a market stall -- a linen-covered trestle, four posts and a
    striped canvas canopy, crates beneath -- and on the counter the morning's goods
    (produce: M1). Origin at its centre, front +z."""
    box('trestle top', -1.2, 1.2, .8, .86, -.55, .55, 'Wood', bevel=.01)
    v = [(-1.2, .5, .56), (1.2, .5, .56), (1.2, .86, .56), (-1.2, .86, .56)]
    quad('cloth', v, 'Cloth', (0, 0, 1)); quad('cloth in', v[::-1], 'Cloth', (0, 0, -1))
    for x in (-1.1, 1.1):
        box('trestle leg', x - .05, x + .05, 0, .8, -.5, .5, 'Wood')
    for x in (-1.35, 1.35):
        for z in (-.75, .75): box('post', x - .045, x + .045, 0, 2.3 + (.25 if z < 0 else 0), z - .045, z + .045, 'Wood')
    can = [(-1.5, 2.3, .95), (1.5, 2.3, .95), (1.5, 2.55, -.95), (-1.5, 2.55, -.95)]
    quad('canopy', can, 'Awning', (0, 1, .1)); quad('canopy under', can[::-1], 'Awning', (0, -1, -.1))
    for x, h in ((-.6, .45), (.5, .35)): box('crate', x - .28, x + .28, 0, h, -.3, .22, 'Wood', bevel=.012)
    produce(-1.1, 1.05, -.45, .45, .86, 7)


def well():
    """A courtyard well: an octagonal rusticated curb with a moulded coping, a bronze
    windlass on two posts and a small verdigris canopy -- gardens and wells inside
    the blocks (decisions 9). M1 (the L look pass: "the bucket reads as a flat
    brown disc"): the solid bronze wheel, seen edge-on from most of the courtyard,
    is now what a well has -- a turned wooden drum on an axle between the posts, a
    crank on one side, a rope wound on it and down to a banded wooden bucket hanging
    over the water."""
    lathe('curb', [(.95, 0, True), (.95, .7, True), (1.02, .74, True), (1.02, .84, True), (.82, .84, True), (.82, .3, True)], 'Rustic', seg=8)
    lathe('water', [(.82, 0, True), (0, 0, True)], 'Water', seg=8, cy=.35)
    for s in (-1, 1): box('post', s * .9 - .08, s * .9 + .08, .84, 2.6, -.08, .08, 'Trim', bevel=.01)
    box('beam', -1.0, 1.0, 2.6, 2.72, -.1, .1, 'Trim', bevel=.01)
    # the windlass: a drum along x between the posts at 2.0 m, the rope wound on it
    AX = Matrix.Translation(Vector((0, 2.0, 0))) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    lathe('axle', [(.035, -.95, True), (.035, .95, True)], 'Bronze', seg=6, M=AX, caps=False)
    lathe('drum', [(.13, -.42, True), (.15, -.4, True), (.15, .4, True), (.13, .42, True), (0, .42, True)], 'Wood', seg=10, M=AX)
    lathe('drum end', [(.13, -.44, True), (0, -.44, True)], 'Wood', seg=10, M=AX)
    lathe('rope coil', [(.165, -.3, True), (.165, .3, True)], 'Canvas', seg=10, M=AX, caps=False)
    # the crank outside the +x post: an arm down and a handle out
    box('crank arm', .98, 1.02, 1.7, 2.02, -.03, .03, 'Bronze')
    box('crank handle', 1.0, 1.22, 1.68, 1.73, -.025, .025, 'Bronze')
    # the rope from the drum's front down to the bucket's bail
    box('rope', -.015, .015, 1.28, 1.86, .135, .165, 'Canvas')
    # the bucket over the water: staves tapering in to the foot, two bronze hoops, a bail
    BY = .82
    lathe('bucket', [(.17, 0, True), (.2, .04, False), (.22, .38, True), (.2, .4, True), (.19, .1, True), (0, .1, True)], 'Wood', seg=10, cy=BY, cz=.15)
    for h in (.08, .3): lathe('hoop', [(.212 + .02 * h, h, True), (.222 + .02 * h, h + .02, True), (.212 + .02 * h, h + .04, True)], 'Bronze', seg=10, cy=BY, cz=.15, caps=False)
    fr = [(Vector((.2 * math.cos(a), BY + .4 + .2 * math.sin(a), .15)), Vector((0, 0, 1)), Vector((math.cos(a), math.sin(a), 0)))
          for a in [math.pi * i / 6 for i in range(7)]]
    sweep('bail', [(-.012, -.012), (.012, -.012), (.012, .012), (-.012, .012)], fr, 'Bronze')
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        tri = [(1.25 * math.cos(a), 2.72, 1.25 * math.sin(a)), (1.25 * math.cos(a + math.pi / 2), 2.72, 1.25 * math.sin(a + math.pi / 2)), (0, 3.4, 0)]
        quad('canopy', tri, 'Copper', (math.cos(a + math.pi / 4), 1, math.sin(a + math.pi / 4)))
        quad('canopy under', tri[::-1], 'Copper', (-math.cos(a + math.pi / 4), -1, -math.sin(a + math.pi / 4)))   # seen from the courtyard
    lathe('finial', [(.08, 0, True), (.11, .1, False), (.05, .22, False), (0, .3, True)], 'CopperRib', seg=8, cy=3.38)


# ======================================================================== THE STREETS AND GARDENS (L2)
def kerb():
    """A 4 m kerbstone, 0.3 m wide and 0.15 m proud, its arrises chamfered: the line
    between a carriageway and its footway (zones/capital_paving.ts lays them,
    stretched to each run). Origin at its centre on the ground, long along x."""
    box('kerb', -2.0, 2.0, 0, .15, -.15, .15, 'Trim', bevel=.03)


def _hedge_run(x0, x1, z0, z1, h, M=None, seg=1.0):
    # clipped box in segments of about a metre, so the leaf panel is never
    # stretched more than that along a face (a rect surface maps each face whole)
    n = max(1, round((x1 - x0) / seg))
    for i in range(n):
        a = x0 + (x1 - x0) * i / n; b = x0 + (x1 - x0) * (i + 1) / n
        box('hedge', a, b, 0, h, z0, z1, 'Hedge', bevel=.05, M=M)


def hedge():
    """A clipped hedge, 4 m long, 0.7 m through, 0.95 m tall: the courtyard
    gardens' hedges (benches backed by them, the walks lined). Origin at its
    centre on the ground, long along x."""
    _hedge_run(-2.0, 2.0, -.35, .35, .95)


def parterre():
    """A parterre bed, 4 x 2.4 m: a clipped box border 0.3 m wide and 0.42 m tall
    round planting dotted with flowers, a topiary ball at its heart -- stretched to
    each bed by its placement (capital_civic.ts gardens). Origin at its centre."""
    W, D, t, h = 2.0, 1.2, .3, .42
    _hedge_run(-W, W, D - t, D, h); _hedge_run(-W, W, -D, -D + t, h)
    for s in (-1, 1): _hedge_run(-D + t, D - t, s * W - (t if s > 0 else 0), s * W + (0 if s > 0 else t), h, M=Matrix.Rotation(math.pi / 2, 4, 'Y'))
    box('bed soil', -W + t, W - t, 0, .12, -D + t, D - t, 'Soil')
    quad('bed planting', [(-W + t, .2, -D + t), (W - t, .2, -D + t), (W - t, .2, D - t), (-W + t, .2, D - t)], 'Flowers', (0, 1, 0))
    lathe('topiary', [(0, .2, True)] + [(.36 * math.sin(math.pi * k / 6), .2 + .36 * (1 - math.cos(math.pi * k / 6)), False) for k in range(1, 6)] + [(0, .92, True)], 'Hedge', seg=10)


def washline():
    """RETURNED city courtyards: a washing line between two posts, the morning's
    linen pegged out. Origin at its centre on the ground, the line along x."""
    for x in (-1.7, 1.7): box('post', x - .045, x + .045, 0, 2.15, -.045, .045, 'Wood')
    box('line', -1.7, 1.7, 1.98, 2.0, -.008, .008, 'Bronze')
    for x0, w, d, surf in ((-1.5, .7, .75, 'Canvas'), (-.65, .55, .55, 'Cloth'), (.05, .8, .9, 'Canvas'), (1.0, .5, .5, 'Canvas')):
        v = [(x0, 1.99 - d, 0), (x0 + w, 1.99 - d, 0), (x0 + w, 1.99, 0), (x0, 1.99, 0)]
        quad('linen', v, surf, (0, 0, 1)); quad('linen back', v[::-1], surf, (0, 0, -1))


# ======================================================================== THE TWO CITIES, CITY-WIDE (L5)
# The dressing that tells the empty city from the morning everywhere, not only on
# the avenue and the square (the direction's empty_vs_returned; the brief's section 4):
# the avenue's banners on its lamp standards, the ward streets' bracket lanterns,
# the square's stalls covered for the night, the child's game in the square, and the
# morning's washing across the back lanes. Every one is a single pooled template
# in the city (capital-architecture.ts), so each is one draw a pass however many
# stand; none is lit by anything but its CL_Glow (the Safari budget).
def banner_pole(surf='Banner'):
    """THE AVENUE'S BANNERS: a banner on two bronze arms off a lamp standard's post,
    hung square to the kerb so it faces up and down the avenue, painted both sides.
    In the lamp's own frame (origin at its foot, its lantern arms along x, +z out
    over the carriageway): placed with the lamp, it is the lamp's fitting. The
    Household's (white, the gold crown) in the empty city; in the returned city the
    three courts' in turn down every row. Below the lantern arms (4.1 m), its foot
    2.2 m up: clear of every head on the walk, its arms out over the kerb."""
    for y in (2.2, 3.8):
        box('banner arm', -.018, .018, y - .018, y + .018, .04, .9, 'Bronze')
        box('banner collar', -.085, .085, y - .045, y + .045, -.085, .085, 'Bronze')
        lathe('arm knob', [(.03, 0, True), (.045, .04, False), (0, .08, True)], 'Bronze', seg=6,
              M=Matrix.Translation(Vector((0, y, .9))) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    # the cloth: the 128 x 304 px banner art at its own proportion, 0.66 x 1.56 m,
    # built in the x-y plane (as banner()) and turned to face along x
    M = Matrix.Translation(Vector((0, 0, .5))) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    vs = [(-.33, 2.22, 0), (.33, 2.22, 0), (.33, 3.78, 0), (-.33, 3.78, 0)]
    quad('banner', vs, surf, (0, 0, 1), M=M); quad('banner back', vs[::-1], surf, (0, 0, -1), M=M)


def lamp_wall():
    """THE WARD STREETS' LANTERNS: a bronze bracket lantern on a ward house's
    rusticated ground storey at a bay joint (the pier between two openings), under
    the storey band. Its glass is CL_Glow: lit at night in the returned city, cold in
    the empty one, no light spent. Origin on the pavement at the facade plane, as a
    bay's (capital_civic.ts mounts it on the bay's -x joint), +z out over the footway."""
    box('wall plate', -.09, .09, 3.0, 3.62, -.02, .03, 'Bronze')
    scroll_console('lantern bracket', 0, 3.05, 3.55, .42, .03, 'Bronze')
    box('lantern arm', -.02, .02, 3.53, 3.58, 0, .6, 'Bronze')
    lathe('arm knob', [(.025, 0, True), (.04, .035, False), (0, .07, True)], 'Bronze', seg=6,
          M=Matrix.Translation(Vector((0, 3.555, .6))) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    box('lantern hanger', -.008, .008, 3.43, 3.54, .5 - .008, .5 + .008, 'Bronze')
    lathe('lantern cap', [(.15, 0, True), (.15, .03, True), (.06, .1, False), (.02, .13, True), (0, .13, True)], 'Bronze', seg=6, cz=.5, cy=3.3)
    lathe('lantern glass', [(.085, 0, True), (.12, .3, True), (0, .3, True)], 'Glow', seg=6, cz=.5, cy=3.0)
    lathe('lantern base', [(.03, 0, True), (.1, .05, True), (0, .05, True)], 'Bronze', seg=6, cz=.5, cy=2.95)


def stall_covered():
    """EMPTY city: the square's market stall put away for the night -- its striped
    canopy rolled up tight to the back rail (the direction's "awnings furled tight to
    their rods"), the counter and its goods under a linen cover drawn down to a hand
    above the paving and roped round, the rope's ends tied off at the posts: closed,
    not abandoned, and as clean as everything else. The stall's own frame and
    footprint (stall(): 3.0 x 1.9 m, front +z), so the two cities' stalls stand on
    the same spots; the cover darker than the cloths so it reads as linen over shapes,
    not a white box (its vertex tint: the canvas swatch is the cloths' near-white), its
    drops a shade under its top so the form turns, and two hemp lashings over it,
    front drop to back, the band that reads at 20 m as a tied cover (the L5 review: a
    lighter cover and a thin rope at the counter's edge read as a slab in a frame)."""
    yf, yb = 2.3, 2.55
    for x in (-1.35, 1.35):
        for z in (-.75, .75): box('post', x - .045, x + .045, 0, (yf if z > 0 else yb), z - .045, z + .045, 'Wood')
        box('side rail', x - .03, x + .03, yb - .06, yb, -.75, .75, 'Wood')
    box('back rail', -1.4, 1.4, yb - .06, yb, -.78, -.72, 'Wood')
    # the canopy rolled on its rod along the back rail
    lathe('rolled canopy', [(.0, -1.42, True), (.13, -1.42, True), (.13, 1.42, True), (0, 1.42, True)], 'Awning', seg=10,
          M=Matrix.Translation(Vector((0, yb + .13, -.75))) @ Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    for x in (-.9, 0, .9): box('canopy tie', x - .025, x + .025, yb - .01, yb + .27, -.89, -.61, 'Wood')
    # the cover: over the counter and the goods heaped on it (two humps), drawn down
    # with a little flare to 0.15 m above the paving
    T = .86
    hump = [(-1.25, T + .02), (-1.0, T + .38), (-.45, T + .42), (-.2, T + .18), (.15, T + .2), (.35, T + .52), (.95, T + .48), (1.25, T + .02)]
    # top: the humps swept across the counter's depth, a little narrower at the top
    vs, fs = [], []
    for x, y in hump:
        vs += [(x, y, .62), (x, y + .03, 0), (x, y, -.62)]
    for i in range(len(hump) - 1):
        a0 = 3 * i
        fs += [(a0, a0 + 3, a0 + 4, a0 + 1), (a0 + 1, a0 + 4, a0 + 5, a0 + 2)]
    mesh('cover top', vs, fs, 'Canvas', facing=(0, 1, 0), tint=.62)
    # the drops: front and back from the top's long edges, ends from its short ones
    fy = .15
    for zs in (1, -1):
        d = []
        for x, y in hump: d += [(x, y, .62 * zs), (x * 1.05, fy, .7 * zs)]
        f = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(len(hump) - 1)]
        mesh('cover drop', d, f, 'Canvas', facing=(0, 0, zs), tint=.5)
    for xs in (1, -1):
        x = 1.25 * xs
        mesh('cover end', [(x, T + .02, .62), (x, T + .05, 0), (x, T + .02, -.62), (x * 1.05, fy, -.7), (x * 1.05, fy, .7)],
             [(0, 1, 2, 3, 4)], 'Canvas', facing=(xs, 0, 0), tint=.5)
    # the rope round the cover at the counter's edge, and its ends to the front posts
    for zs in (1, -1): box('rope', -1.33, 1.33, .63, .685, .66 * zs - .025, .66 * zs + .025, 'Bronze')
    for xs in (1, -1): box('rope', 1.33 * xs - .025, 1.33 * xs + .025, .63, .685, -.66, .66, 'Bronze')
    # the lashings: hemp (the bronze swatch's tan) over the humps, 1.5 cm proud of the
    # cover, down both drops to the trestles
    hy = lambda x: next(y0 + (y1 - y0) * (x - x0) / (x1 - x0) for (x0, y0), (x1, y1) in zip(hump, hump[1:]) if x0 <= x <= x1)
    for x in (-.62, .62):
        y, w, o = hy(x), .035, .015
        mesh('lashing', [(x - w, y + o, .62), (x + w, y + o, .62), (x + w, y + .03 + o, 0), (x - w, y + .03 + o, 0)], [(0, 1, 2, 3)], 'Bronze', facing=(0, 1, 0))
        mesh('lashing', [(x - w, y + .03 + o, 0), (x + w, y + .03 + o, 0), (x + w, y + o, -.62), (x - w, y + o, -.62)], [(0, 1, 2, 3)], 'Bronze', facing=(0, 1, 0))
        for zs in (1, -1):
            mesh('lashing', [(x - w, y, (.62 + o) * zs), (x + w, y, (.62 + o) * zs), (x * 1.05 + w, fy, (.7 + o) * zs), (x * 1.05 - w, fy, (.7 + o) * zs)],
                 [(0, 1, 2, 3)], 'Bronze', facing=(0, 0, zs))
    box('trestle feet', -1.15, -1.05, 0, fy, -.5, .5, 'Wood'); box('trestle feet', 1.05, 1.15, 0, fy, -.5, .5, 'Wood')


def childs_game(state):
    """THE CHILD'S GAME (cap1: "a child's game abandoned mid-move in the square"; the
    returned city's Old Stone-Player: "It's my move. It's been my move for three
    hundred years. Don't touch the stones."). A board of the empire's own kind -- a
    limestone flag ruled seven lines by seven in slate, the survey grid a child plays
    on -- set on the square's paving, white and black stones on its points. EMPTY: a
    black stone stopped between two points, mid-move, another fallen to the paving
    beside the board and the stones' pouch spilled. RETURNED: the move made, the
    dropped stone back in play, the pouch tied. Origin at the board's centre on the
    paving; a walker crosses it (5 cm), so it carries no collider."""
    box('board', -.72, .72, 0, .05, -.72, .72, 'Trim', bevel=.01)
    for i in range(7):
        t = -.6 + .2 * i
        box('rule', -.6, .6, .05, .054, t - .008, t + .008, 'Slate')
        box('rule', t - .008, t + .008, .05, .054, -.6, .6, 'Slate')
    stone = [(.065, 0, True), (.072, .012, False), (.058, .026, False), (0, .032, True)]
    put = lambda surf, x, z, y=.054: lathe('stone', stone, surf, seg=6, cx=x, cy=y, cz=z)
    whites = [(-1, -1), (0, -1), (1, 0), (-2, 1), (0, 2), (2, -2), (1, 2), (-1, 0), (-3, 2)]
    blacks = [(0, 0), (1, -1), (-1, 1), (2, 0), (0, 1), (-2, -1), (1, 1), (3, -1)]
    for i, j in whites: put('Ceramic', .2 * i, .2 * j)
    for i, j in blacks: put('Slate', .2 * i, .2 * j)
    # the stones' pouch: walnut leather (a swatch: the box-mapped 'Wood' strip's
    # tile-unit UVs ran off a lathe this small onto the sheet's light rects -- a
    # white lump in the L5 shots), gathered at the neck
    bag = [(0, 0, True), (.1, .01, False), (.13, .07, False), (.1, .14, False), (.04, .18, True), (.06, .22, False), (0, .23, True)]
    if state == 'e':
        put('Slate', .3, -.1)                    # stopped between two points: the move never finished
        put('Slate', 1.0, .38, 0)                # fallen to the paving
        lathe('pouch', [(0, 0, True), (.12, .01, False), (.15, .05, False), (.1, .09, True), (0, .1, True)], 'Leather', seg=8,
              M=Matrix.Translation(Vector((-.98, .06, -.5))) @ Matrix.Rotation(1.25, 4, 'Z'))
        for x, z in ((-.78, -.44), (-.72, -.58), (-.84, -.32)): put('Ceramic', x, z, 0)
    else:
        put('Slate', .4, -.2)                    # the move made
        lathe('pouch', bag, 'Leather', seg=8, cx=-.98, cz=-.5)


def washline_street():
    """RETURNED city: the morning's washing strung across a back lane from window to
    window. Origin on the lane's centre line at the paving, the line along x between
    the two facades 7 m apart (placed stretched along x to its lane's own span),
    6.5 m up at the walls -- over the ward rank's ground storey and band, between
    the piano nobile's sills and heads -- sagging a quarter metre; the lowest linen
    is 5.3 m up, over any head and cart."""
    Y, SAG, H = 6.5, .25, 3.5
    yl = lambda x: Y - SAG * (1 - (x / H) ** 2)
    for s in (-1, 1): box('wall hook', s * H - .05, s * H + .05, Y - .06, Y + .06, -.05, .05, 'Bronze')
    K = 8
    for k in range(K):
        a, b = -H + 2 * H * k / K, -H + 2 * H * (k + 1) / K
        ang = math.atan2(yl(b) - yl(a), b - a)
        box('line', -(b - a) / 2 - .005, (b - a) / 2 + .005, -.008, .008, -.008, .008, 'Bronze',
            M=Matrix.Translation(Vector(((a + b) / 2, (yl(a) + yl(b)) / 2, 0))) @ Matrix.Rotation(ang, 4, 'Z'))
    for x0, w, d, surf in ((-2.9, .8, .9, 'Canvas'), (-1.85, .55, .6, 'Cloth'), (-1.1, .9, 1.0, 'Canvas'), (.1, .6, .7, 'Canvas'),
                           (.95, .75, .85, 'Cloth'), (2.0, .5, .55, 'Canvas')):
        v = [(x0, yl(x0) - d, 0), (x0 + w, yl(x0 + w) - d, 0), (x0 + w, yl(x0 + w), 0), (x0, yl(x0), 0)]
        quad('linen', v, surf, (0, 0, 1)); quad('linen back', v[::-1], surf, (0, 0, -1))


def window_box():
    """RETURNED city: a window box on the piano nobile's sill (the ward rank's: the
    avenue's windows have their balconettes), flowers over clipped green, on two
    bronze brackets. In the window's frame (nobile(): the sill's top at WY0, the facade
    at z 0); clear of the shutters folded back beside the window (shutters())."""
    box('window box', -.8, .8, WY0, WY0 + .24, .1, .36, 'Wood', bevel=.01)
    # LOD1 (past 45 m) keeps the box and its flowers; the green and the brackets
    # go, so a courtyard face's LOD1 stays within a quarter of its LOD0
    if not lod():
        box('box planting', -.76, .76, WY0 + .24, WY0 + .34, .13, .33, 'Hedge')
        for s in (-1, 1): box('box bracket', s * .55 - .02, s * .55 + .02, WY0 - .22, WY0, .02, .3, 'Bronze')
    yf = WY0 + (.345 if not lod() else .245)
    quad('box flowers', [(-.76, yf, .33), (.76, yf, .33), (.76, yf, .13), (-.76, yf, .13)], 'Flowers', (0, 1, 0))


# ======================================================================== THE CENSUS ROOM (K3)
# The Hall of the Household is entered: its great door stands open (cella_door_open)
# on one room, the site floor 0 where Sabel waits and the rolls lie open. A square
# galleried hall under a coffered ceiling, not the direction's rotunda under the
# dome: the dome stands on the roof terrace above a flat ceiling, and an oculus would
# look up into a drum whose faces are single-sided from outside (K3 report).
def hall_stack(w=4.0, H=10.0):
    """The room's walls, one 4 m bay from the floor to the coffered ceiling: two tiers
    of pigeonhole presses (the rolls painted on one repeating panel -- the direction's
    'one painted repeating texture, not modelled cells'), a gallery on scroll brackets
    between them at 4.4 m with a bronze rail, a press cornice, a plain frieze and a
    moulded cornice under the ceiling. Origin at the wall face on the floor, +z into
    the room; each bay carries the frieze pilaster at its -x joint, as the facades do."""
    hw = w / 2
    quad('wall', [(-hw, 0, 0), (hw, 0, 0), (hw, H, 0), (-hw, H, 0)], 'Plaster', (0, 0, 1))
    box('press plinth', -hw, hw, 0, .3, 0, .5, 'Wood')
    box('lower press', -hw + .05, hw - .05, .3, 4.4, 0, .45, 'Wood')
    card('lower rolls', -hw + .12, hw - .12, .38, 4.32, .455, 'Shelves')
    box('gallery', -hw, hw, 4.4, 4.6, 0, 1.15, 'Wood')
    for x in (-hw + .7, hw - .7): scroll_console('gallery bracket', x, 3.55, 4.4, .65, .14, 'Wood', z0=.45)
    for x in (-hw + .1, 0.0): box('rail post', x - .025, x + .025, 4.6, 5.56, 1.05, 1.1, 'Bronze')
    box('rail', -hw, hw, 5.56, 5.64, 1.03, 1.12, 'Bronze')
    box('upper press', -hw + .05, hw - .05, 4.6, 8.4, 0, .4, 'Wood')
    card('upper rolls', -hw + .12, hw - .12, 4.68, 8.32, .405, 'Shelves')
    box('press cornice', -hw, hw, 8.4, 8.6, 0, .5, 'Wood')
    box('frieze pilaster', -hw, -hw + .3, 8.6, H - .4, 0, .1, 'Trim')
    sweep('ceiling cornice', [(0, 0), (.06, 0)] + cyma(.06, 0, .3, .32, 4) + [(.32, .4), (0, .4)], run_x(-hw, hw, H - .4), 'Trim')


def hall_table():
    """THE CENSUS TABLE in the middle of the room: round walnut on a turned pedestal,
    the rolls lying open across it -- parchment held flat by bronze rules, rolled at
    both ends -- and closed rolls stacked at the rim. Origin at its centre on the
    floor; 3 m across, its top at 0.8 m."""
    R, y = 1.5, .8
    lathe('foot', [(.7, 0, True), (.7, .1, True), (.35, .22, False), (.2, .45, False), (.26, .62, False), (.34, .72, True), (0, .72, True)], 'Wood', seg=16)
    lathe('top', [(R - .06, .72, True), (R, .75, True), (R, y, True), (0, y, True)], 'Wood', seg=32)
    for a in (.3, 1.9, 3.5, 5.0):
        M = Matrix.Translation(Vector((math.cos(a) * .78, y + .004, math.sin(a) * .78))) @ Matrix.Rotation(-a, 4, 'Y')
        quad('open roll', [(-.32, 0, -.45), (.32, 0, -.45), (.32, 0, .45), (-.32, 0, .45)], 'Canvas', (0, 1, 0), M=M)
        for s in (-1, 1):
            Mc = M @ Matrix.Translation(Vector((0, .035, s * .47))) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
            lathe('roll end', [(.035, -.34, True), (.035, .34, True)], 'Canvas', seg=8, M=Mc)
        box('rule', -.3, .3, 0, .015, -.02, .02, 'Bronze', M=M)
    for k, (x, z, a, h) in enumerate([(-.2, -.1, .4, 0), (.15, .05, -.3, 0), (0, -.02, 1.2, .07)]):
        M = Matrix.Translation(Vector((x, y + .045 + h, z))) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Rotation(math.pi / 2, 4, 'Z')
        lathe('closed roll', [(.045, -.3, True), (.045, .3, True)], 'Canvas', seg=8, M=M)


def archive_desk(state):
    """THE ARCHIVE'S READING DESK in the room of presses, where the story's desk is
    (zones.json archive_desk / returned_archive_desk: scene.ts's zone_desk stands
    only its grab box): a long walnut desk on two panelled standards, the minutes
    lying open in their boards under a bronze rule, closed rolls at one end, a
    bronze inkstand at the other, the archivist's chairs on its +z side. EMPTY
    city: both chairs pushed in. RETURNED: one drawn back and turned, the work
    going on. Origin at its centre on the floor, long axis along x; 2.9 x 1.16 m,
    the Table_Large footprint the story's colliders and the room's spots were
    laid round, its top at 0.8 m."""
    Lh, Dh, y = 1.45, .58, .8
    box('desk top', -Lh, Lh, y - .04, y, -Dh, Dh, 'Wood', bevel=.01)
    box('desk apron', -Lh + .1, Lh - .1, y - .18, y - .04, -Dh + .08, Dh - .08, 'Wood')
    for sx in (-1, 1):
        x = sx * (Lh - .25)
        box('desk standard', x - .05, x + .05, .1, y - .18, -Dh + .14, Dh - .14, 'Wood')
        box('desk foot', x - .09, x + .09, 0, .1, -Dh + .06, Dh - .06, 'Wood', bevel=.015)
    box('desk stretcher', -Lh + .25, Lh - .25, .16, .24, -.04, .04, 'Wood')
    # the minutes, open in their boards, a bronze rule across both pages
    box('minute boards', -.46, .46, y, y + .025, -.33, .31, 'Wood')
    for sx in (-1, 1): box('minute pages', min(0, sx * .43) + (.01 if sx > 0 else 0), max(0, sx * .43) - (.01 if sx < 0 else 0), y + .025, y + .05, -.3, .28, 'Canvas')
    box('rule', -.42, .42, y + .05, y + .062, .08, .11, 'Bronze')
    # closed rolls, stacked, at the -x end
    for x, z, h in ((-1.1, -.12, 0), (-1.1, .02, 0), (-1.1, -.05, .085)):
        M = Matrix.Translation(Vector((x, y + .045 + h, z))) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
        lathe('closed roll', [(.045, -.25, True), (.045, .25, True)], 'Canvas', seg=8, M=M)
    # the inkstand at the +x end
    box('inkstand', .9, 1.22, y, y + .03, -.2, .02, 'Bronze', bevel=.006)
    lathe('inkpot', [(.045, 0, True), (.05, .04, False), (.03, .07, True), (0, .07, True)], 'Bronze', seg=8, cx=1.0, cy=y + .03, cz=-.09)
    box('quill', 1.08, 1.11, y + .03, y + .045, -.24, .12, 'Canvas')
    if state == 'e':
        for x in (-.6, .6): chair(x, .5, 0)
    else:
        # drawn back no further than the desk's collider (capital_civic.ts archive):
        # the clerk (citizen_2) stands 1.8 m off the desk's middle on this side
        chair(-.6, .5, 0)
        chair(.68, .7, -.3)


def hall_panel(w=4.0, H=10.0):
    """A plain lime-washed stretch of the room's wall, where the side presses stop
    short of the back run's gallery (the corner would otherwise show the cella's
    blind recesses from behind -- single-sided, so the sky)."""
    quad('wall', [(-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, H, 0), (-w / 2, H, 0)], 'Plaster', (0, 0, 1))


def hall_room_far(W=22.0, D=18.8, H=10.05, back_bays=5):
    """THE CENSUS ROOM SEEN FROM OUTSIDE. Its presses, panels, floor and coffered
    ceiling are drawn within LOD0's 45 m only, and the cella's slabs and the lead
    flats are single-sided from outside -- so from further off the open great door
    looked straight through the Hall to the sky, from the fountain on the door's own
    axis above all (K3 review). These are the inner faces of the cella's walls and of
    the room's ceiling, in the Hall's shell at every distance: the two tiers of
    presses painted on them (the same Shelves panel, one per bay, with the gallery
    as a walnut band) between plaster in shade, so the room still reads as the room
    past 45 m, for no draw of its own (its stone and joinery join the shell's).
    Behind the presses (0.6 m) and over the coffers (5 cm) at LOD0, so never seen
    in the room itself. Origin at the front slab's inner face (cella front - 0.6 m)
    on the podium's top, the room toward -z; no front face (the viewer is on that
    side)."""
    hw, t = W / 2, .42
    def wall(M, length, bays):
        # a wall facing +z in its own frame, x 0..length: plaster below, between
        # and above the tiers (as hall_stack's: .38-4.32 and 4.68-8.32), the gallery
        # band between them in walnut
        for y0, y1, surf in ((0, .38, 'Plaster'), (4.32, 4.68, 'Wood'), (8.32, H, 'Plaster')):
            mesh('far band', [(0, y0, 0), (length, y0, 0), (length, y1, 0), (0, y1, 0)], [(0, 1, 2, 3)], surf, M=M, facing=(0, 0, 1), tint=t)
        w = length / bays
        for k in range(bays):
            for y0, y1 in ((.38, 4.32), (4.68, 8.32)):
                mesh('far rolls', [(k * w, y0, 0), ((k + 1) * w, y0, 0), ((k + 1) * w, y1, 0), (k * w, y1, 0)], [(0, 1, 2, 3)], 'Shelves', M=M,
                     facing=(0, 0, 1), uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]], tint=.7)
    wall(Matrix.Translation(Vector((-hw, 0, -D))), W, back_bays)
    wall(Matrix.Translation(Vector((-hw, 0, 0))) @ Matrix.Rotation(math.pi / 2, 4, 'Y'), D, 4)
    wall(Matrix.Translation(Vector((hw, 0, -D))) @ Matrix.Rotation(-math.pi / 2, 4, 'Y'), D, 4)
    mesh('far ceiling', [(-hw, H, 0), (hw, H, 0), (hw, H, -D), (-hw, H, -D)], [(0, 1, 2, 3)], 'Plaster', facing=(0, -1, 0), tint=t)


# THE HALL'S SHELL (K3 review, Philip's performance gate): everything of the Hall
# that never switches LOD -- podium, portico floor and ceiling, entablatures,
# pediment, the cella's walls and open door, the lead flats, the far room, the
# banners and braziers of the city's state -- merged into ONE module per city, one
# mesh per material. As ~13 one-instance templates it was ~19 draws in the main
# pass, 21 in the three shadow cascades and 14 in the glow pass; merged it is one
# submesh per material. The columns, the roof balustrade and the dome switch LOD
# and stay instanced (zones/capital_civic.ts). The parts are the assembly the
# runtime used to instance, in the Hall's frame (origin the podium's front face on
# the axis, +z out toward the square): the manifest records them and
# capital_layout.test.mjs holds them to zones/capital_civic.ts's, which derives
# the colliders from the same datums.
LAYOUT = json.loads((ROOT / 'client/src/capital-layout.json').read_text())


def hall_shell_parts(state):
    W, POD, DEPTH = 11.6, 1.6, 27.0
    COL_TOP = POD + 10.0; ENT_TOP = COL_TOP + 2.4; HP = math.pi / 2
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, axes))
    part('hall_podium', 0, 0, 0)
    part('hall_portico_floor', 0, POD, 0)
    part('cent_front', 0, COL_TOP, -.85)
    for sx in (-1, 1):
        rot = -HP if sx < 0 else HP
        for k in range(6): part('cent', sx * W, COL_TOP, -.85 - 2 - 4.36 * k, rot, (1.09, 1, 1))
        part('cent_cnr', sx * W, COL_TOP, -.85, -HP if sx < 0 else 0)
        part('cent_cnr', sx * W, COL_TOP, -DEPTH, math.pi if sx < 0 else HP)
    for k in range(5): part('cent', -W + 2.32 + 4.64 * k, COL_TOP, -DEPTH, math.pi, (1.16, 1, 1))
    part('hall_ped', 0, ENT_TOP, -.85)
    for k in range(5): part('coffers', -9.28 + 4.64 * k, COL_TOP, -3.95, 0, (1.16, 1, 1.5))
    part('cella_door_open', 0, POD, -7)
    for sx in (-1, 1):
        for k in (0, 1): part('cella_bay', sx * (3 + 2.15 + 4.3 * k), POD, -7, 0, (1.075, 1, 1))
    for sx in (-1, 1):
        for k in range(5): part('cella_bay', sx * W, POD, -7.6 - 1.94 - 3.88 * k, -HP if sx < 0 else HP, (.97, 1, 1))
    for k in range(5): part('cella_bay', -11 + 2.2 + 4.4 * k, POD, -DEPTH, math.pi, (1.1, 1, 1))
    for j in range(5):
        for k in range(5): part('roof_deck', -9.28 + 4.64 * j, ENT_TOP - .02, -7 - 4 * k, 0, (1.16, 1, 1))
    part('hall_room_far', 0, POD, -7.6)
    for u, f in LAYOUT['hall']['banners'][state]: part(f, u, COL_TOP - 6.25, -1.5)
    for sx in (-1, 1): part('brazier' if state == 'r' else 'brazier_cold', sx * (W - .45), POD + .4, 2.9)
    return P


def hall_shell(state):
    builders = {name: fn for name, kind, fn, budget, lod_of, lvl, aod, extra in MODS if not lod_of}
    for f, u, y, v, rot, axes in hall_shell_parts(state):
        M = Matrix.Translation(Vector((u, y, v))) @ Matrix.Rotation(rot, 4, 'Y') @ Matrix.Diagonal((*axes, 1))
        with at(M=M): builders[f]()


def hall_floor(W=20.8, D=17.6):
    """The room's floor: dressed flags over the podium's rubble top, a hair above it.
    Origin at the middle of the door wall's inner face, the room toward -z."""
    box('floor', -W / 2, W / 2, -.05, .03, -D, 0, 'Ashlar')


# ======================================================================== THE NAMED BUILDINGS (L3)
# The Archive closes Survey Street's east end and the Chapel its west end, each a
# civic building in the direction's hierarchy (a house has an arcade and a hidden
# roof; a civic building a podium of nine steps, a FREESTANDING pedimented portico
# and copper): the Hall's own order -- 10 m columns, its entablature, its blind
# arcading -- on a smaller front, 14.6 m and four columns against the Hall's six,
# so the Hall of the Household stays the first building of the square. The
# Archive is a hall of presses with its rolls tower beside it, the Chapel a
# domed rotunda of lamps behind its portico. zones/capital_civic.ts plans where
# every piece stands and derives the colliders from the same datums; the shells
# below are merged from the very part lists it plans (the node test holds the two
# equal, as it does the Hall's).
SF_W = 14.6                          # a small temple front (capital_civic.ts FRONT.halfW * 2)


def square_frames(h, y):
    """Mitred frames round a square of half side h at height y, closed, outward."""
    P = [Vector((-h, y, h)), Vector((h, y, h)), Vector((h, y, -h)), Vector((-h, y, -h))]
    N = [Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 0, -1)), Vector((-1, 0, 0))]
    return path_frames(P, N, closed=True)


def quarter(k, z=0.0, y=0.0):
    """Face k of a square (0 = +z, turning to +x): its frame, the face at z."""
    return Matrix.Rotation(k * math.pi / 2, 4, 'Y') @ Matrix.Translation(Vector((0, y, z)))


# THE ARCHIVE'S TOWER: where the rolls are kept, standing beside the hall at its
# back corner -- a palazzo pubblico's civic tower, not a church's: off the axis,
# never rising behind the portico. Banded rustication to the string course, an
# ashlar shaft with corner pilasters and one tall sash a face, the entablature,
# a CLOCK STAGE -- a slate dial with gilt hours and hands on each face between
# its pilasters, the hours the empire keeps its appointments by -- a blocking
# course with urns and a small ribbed verdigris dome. No cone (cones are
# Caerdun's and Moonmere's). The stage was first four arches with shutters
# behind them: from Survey Street, where the tower stands beside the Archive's
# pediment, a louvred arched top stage is a church's belfry and its campanile
# (L3 review), and the civic set is not ecclesiastical. A dial is the town
# hall's. Origin at its foot on the floor, its middle.
TOWER = {'half': 3.5, 'shaft': 3.3, 'rustic': 7.0, 'ent': 19.0, 'stage': (20.1, 23.7), 'stageHalf': 2.9, 'top': 25.3}


def clock_dial(z, yc, R=1.1):
    """A tower clock on the face plane z, centred yc up: a slate dial in a gilt
    bezel, gilt hour batons (the quarters heavier) and two gilt hands at ten past
    ten. LOD1 keeps the dial, the bezel and the quarters' batons."""
    up = Matrix.Translation(Vector((0, yc, z))) @ Matrix.Rotation(math.pi / 2, 4, 'X')   # the lathe's +y out of the face
    lathe('dial', [(R, 0, True), (R, .06, True)], 'Slate', seg=16, M=up)
    lathe('dial bezel', [(R + .14, 0, True), (R + .14, .08, True), (R + .04, .13, True), (R - .02, .09, True)], 'Gilt', seg=16, caps=False, M=up)
    for h in range(12):
        if lod() and h % 3: continue
        q = h % 3 == 0
        M = Matrix.Translation(Vector((0, yc, z))) @ Matrix.Rotation(-h * math.pi / 6, 4, 'Z')
        box('hour', -(.07 if q else .035), .07 if q else .035, R - (.3 if q else .2), R - .06, .06, .09, 'Gilt', M=M)
    for a, ln, w, dz in ((math.radians(-300), R * .55, .055, .09), (math.radians(-60), R * .82, .035, .12)):
        M = Matrix.Translation(Vector((0, yc, z))) @ Matrix.Rotation(a, 4, 'Z')
        box('hand', -w, w, -.12, ln, dz, dz + .03, 'Gilt', M=M)


def archive_tower():
    T, S, sh = TOWER['half'], TOWER['shaft'], TOWER['stageHalf']
    y_ent, (s0, s1), top = TOWER['ent'], TOWER['stage'], TOWER['top']
    # the socle runs a metre under the floor, so no grid sag shows under it
    box('socle', -T - .12, T + .12, -1.0, .5, -T - .12, T + .12, 'Trim')
    box('rustic shaft', -T, T, .5, TOWER['rustic'], -T, T, 'Rustic')
    box('shaft', -S, S, TOWER['rustic'], y_ent, -S, S, 'Ashlar')
    if lod():
        box('string', -T - .08, T + .08, TOWER['rustic'], TOWER['rustic'] + .2, -T - .08, T + .08, 'Trim')
        box('entablature', -S - .5, S + .5, y_ent, y_ent + H_ENT, -S - .5, S + .5, 'Trim')
    else:
        sweep('plinth', PLINTH(), square_frames(T, .5), 'Trim', closed=True)
        sweep('string', STRING(), square_frames(T, TOWER['rustic']), 'Trim', closed=True)
        sweep('entablature', ENT(), square_frames(S, y_ent), 'Trim', closed=True)
    for k in range(4):
        with at(M=quarter(k, S)):
            card('sash', -.65, .65, 11.4, 14.6, .012, 'Glass')
            if not lod():
                sweep('architrave', [(0, 0), (.1, 0), (.1, .16), (.06, .22), (0, .22)], face_frame(-.65, .65, 11.4, 14.6, 0), 'Trim')
                box('sill', -.95, .95, 11.2, 11.4, 0, .2, 'Trim', bevel=.015)
                box('hood', -1.0, 1.0, 14.82, 15.02, 0, .26, 'Trim', bevel=.015)
                prism('hood pediment', [(-1.0, 15.02), (1.0, 15.02), (0, 15.5)], 0, .22, 'Trim')
                # the corner pilasters, one face's pair (its neighbour turns round to the next)
                for sx in (-1, 1):
                    # the +x one runs on past the corner by its depth and closes the angle
                    # (face k's +x end is face k+1's -x end); both running on fought
                    # in the corner's shared faces (LOOKED: a flickering seam)
                    xa, xb = sorted((sx * (S - .55), sx * (S + (.12 if sx > 0 else 0))))
                    box('pilaster', xa, xb, TOWER['rustic'] + .2, y_ent - .2, 0, .12, 'Trim')
        # the stage's face: the clock between its pilasters
        with at(M=quarter(k, 0, s0)):
            clock_dial(sh, (s1 - s0) / 2)
            if not lod():
                for sx in (-1, 1):
                    box('stage pilaster', sx * 1.55 - .2, sx * 1.55 + .2, 0, s1 - s0, sh, sh + .1, 'Trim')
    # the stage itself: one solid block of ashlar, the dials on its faces
    box('stage', -sh, sh, s0, s1, -sh, sh, 'Ashlar')
    if lod():
        box('cornice', -sh - .5, sh + .5, s1, s1 + H_ENT, -sh - .5, sh + .5, 'Trim')
    else:
        sweep('cornice', ENT(), square_frames(sh, s1), 'Trim', closed=True)
    box('blocking', -sh, sh, s1 + H_ENT, top, -sh, sh, 'Ashlar')
    quad('leads', [(-sh, top, sh), (sh, top, sh), (sh, top, -sh), (-sh, top, -sh)], 'Lead', (0, 1, 0))
    if not lod():
        for sx in (-1, 1):
            for sz in (-1, 1):
                lathe('urn', [(r * 1.8, yy * 1.8, h) for r, yy, h in URN], 'Trim', seg=10, cx=sx * (sh - .35), cy=top, cz=sz * (sh - .35))
    with at(y=top): dome_kit(2.3, 1.4, 8, 8)


# THE CHAPEL'S ROTUNDA: a twelve-sided drum of the Hall's blind arcading (one bay a
# facet, at its width), the civic entablature run round it on mitred corners, a
# lead ring, a stepped attic ring and the attic's leads the dome stands on. The
# three facets toward the front are left out: the portico's block stands there and
# meets the drum at its corners. Civic and imperial, not ecclesiastical: no tower
# behind the front, no cross, no saint -- the empire "doesn't do religion, it does
# appointments" (LORE.md), and this is a domed hall of lamps. Origin at its centre
# on the podium's top.
ROT = {'a': 10.0, 'n': 12, 'skip': (0, 1, 11), 'H': 10.0, 'attic': (9.4, 1.6)}


def rotunda():
    a, n, H = ROT['a'], ROT['n'], ROT['H']
    attic_r, attic_h = ROT['attic']
    th = math.pi / n; w = 2 * a * math.tan(th); Rc = a / math.cos(th)
    vis = [k for k in range(n) if k not in ROT['skip']]
    face = lambda k: Matrix.Rotation(2 * th * k, 4, 'Y') @ Matrix.Translation(Vector((0, 0, a)))
    for k in vis:
        with at(M=face(k)):
            cella_bay(H, w, plinth=False)
            if not lod():
                nd = int(round(w / .25))
                for i in range(nd):
                    x = -w / 2 + (i + .5) * w / nd
                    box('dentil', x - .065, x + .065, H + 1.76, H + 1.92, 0, .42, 'Trim')
                nm = int(round(w / .8))
                for i in range(nm):
                    scroll_console('modillion', -w / 2 + (i + .5) * w / nm, H + 1.8, H + 1.92, .95, .16, 'Trim', z0=.25)
    # the plinth and the entablature round the visible facets, one mitred run each
    pts = lambda y: [Vector((Rc * math.sin((2 * k - 1) * th), y, Rc * math.cos((2 * k - 1) * th))) for k in range(vis[0], vis[-1] + 2)]
    nrm = [Vector((math.sin(2 * th * k), 0, math.cos(2 * th * k))) for k in vis]
    sweep('rotunda plinth', CELLA_PLINTH(), path_frames(pts(0), nrm), 'Trim')
    sweep('rotunda entablature', CENT(), path_frames(pts(H), nrm), 'Trim')
    # the lead ring from the wall plane in to the attic, the whole way round (the
    # block's own flats run under it at the front: 6 cm lower, no fighting)
    y = H + 2.4 + .04
    angs = sorted({2 * math.pi * i / 48 for i in range(48)} | {(2 * k + 1) * th for k in range(n)})
    ring_o = [(a / math.cos(f - 2 * th * round(f / (2 * th))), f) for f in angs]
    vs = [(r * math.sin(f), y, r * math.cos(f)) for r, f in ring_o] + [(attic_r * math.sin(f), y, attic_r * math.cos(f)) for _, f in ring_o]
    m = len(angs)
    mesh('ring leads', vs, [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)], 'Lead', facing=(0, 1, 0))
    y0, yt = H + 2.4, H + 2.4 + attic_h
    lathe('attic', [(attic_r, y0, True), (attic_r, yt - .3, True)], 'Ashlar', seg=48, caps=False)
    lathe('attic cornice', [(attic_r, yt - .3, True), (attic_r + .12, yt - .2, False), (attic_r + .22, yt - .08, True), (attic_r + .22, yt, True), (attic_r - .02, yt, True)], 'Trim', seg=48, caps=False)
    lathe('attic leads', [(attic_r, yt + .005, True), (0, yt + .005, True)], 'Lead', seg=48, caps=False)


def chapel_lamp():
    """THE CHAPEL'S LAMPS ("lit that night"): a tall bronze standard on a stone die
    with one great hexagonal lantern under a verdigris cap. Its panes are the stone
    sheet's 'Dark' -- the lamp-core texel the night sheet lights in BOTH cities, as
    the chapel dome's -- so these burn in the empty city too, where every other
    street lamp and every other dome lantern is cold. Origin at its foot."""
    box('base', -.45, .45, 0, .28, -.45, .45, 'Trim', bevel=.02)
    box('die', -.34, .34, .28, 1.0, -.34, .34, 'Trim', bevel=.02)
    box('die cap', -.4, .4, 1.0, 1.1, -.4, .4, 'Trim', bevel=.015)
    prof = [(.13, 1.1, True), (.13, 1.2, True), (.085, 1.32, False)] + [(.085 - .02 * i / 4, 1.32 + 1.6 * i / 4, False) for i in range(1, 5)]
    prof += [(.1, 2.98, True), (.2, 3.04, True), (.2, 3.12, True), (0, 3.12, True)]
    lathe('standard', prof, 'Bronze', seg=10, flutes=5, fdepth=.12, fy=(1.4, 2.85))
    lathe('lantern', [(.25, 3.12, True), (.3, 3.86, True), (0, 3.86, True)], 'Dark', seg=6, phase=math.pi / 6)
    for k in range(6):
        # on the hexagon's corners (the lathe's six segments start at its phase)
        f = math.pi / 6 + math.pi / 3 * k
        box('lantern rib', -.025, .025, 3.12, 3.86, -.025, .025, 'Bronze', M=Matrix.Translation(Vector((math.cos(f) * .28, 0, math.sin(f) * .28))))
    lathe('lantern cap', [(.38, 3.86, True), (.38, 3.93, True), (.16, 4.2, False), (.06, 4.34, True), (.08, 4.4, True), (0, 4.5, True)], 'Copper', seg=12)


# THE TENANTS' SIGNS. The bakery, the inn and the auction house are block houses
# (L2) and the armoury the avenue's projecting house (K2); a house never gets a
# portico, so what tells them from their neighbours is the trade's sign: a teal
# board on a bronze bracket over the door on the ward streets, the emblem cut in
# bronze through it -- a sheaf, a cup, a balance -- and under the armoury's door
# arch a board on chains, a shield on crossed blades. Origin at the bracket's root
# on the facade at the mounting height, +z out into the street; the armoury's at
# its chains' top, the board facing +z.
def _sheaf():
    for a in (-.42, -.21, 0, .21, .42):
        M = Matrix.Translation(Vector((0, -.98, .7))) @ Matrix.Rotation(-a, 4, 'X')
        prism('stalk', [(-.012, 0), (.012, 0), (.012, .42), (-.012, .42)], -.045, .045, 'Bronze', M=M, axis='x')
        ear = [(.035 * math.sin(math.pi * j / 6), .42 + .16 * (1 - math.cos(math.pi * j / 6)) / 2) for j in range(7)]
        prism('ear', ear + [(-p[0], p[1]) for p in ear[::-1]], -.045, .045, 'Bronze', M=M, axis='x')
    prism('band', [(.62, -.82), (.78, -.82), (.78, -.76), (.62, -.76)], -.05, .05, 'Bronze', axis='x')


def _cup():
    half = [(.12, -1.0), (.12, -.97), (.03, -.93), (.025, -.78), (.05, -.75), (.15, -.66), (.17, -.52), (.17, -.44)]
    poly = [(.7 + x, y) for x, y in half] + [(.7 - x, y) for x, y in half[::-1]]
    prism('cup', poly, -.045, .045, 'Bronze', axis='x')


def _balance():
    prism('post', [(.685, -1.02), (.715, -1.02), (.715, -.48), (.685, -.48)], -.04, .04, 'Bronze', axis='x')
    prism('foot', [(.6, -1.04), (.8, -1.04), (.78, -1.0), (.62, -1.0)], -.04, .04, 'Bronze', axis='x')
    prism('beam', [(.42, -.53), (.98, -.53), (.98, -.5), (.42, -.5)], -.045, .045, 'Bronze', axis='x')
    for zc in (.45, .95):
        prism('cords', [(zc - .01, -.5), (zc + .01, -.5), (zc + .09, -.78), (zc - .09, -.78)], -.03, .03, 'Bronze', axis='x')
        prism('pan', [(zc - .12, -.78), (zc + .12, -.78), (zc + .07, -.84), (zc - .07, -.84)], -.045, .045, 'Bronze', axis='x')


def _shield(c):
    """A heater shield on two crossed blades, in the board's (x, y) plane."""
    u0, y0 = c; axis = 'z'
    sh = [(-.17, .2), (.17, .2), (.17, .02), (.12, -.14), (0, -.24), (-.12, -.14), (-.17, .02)]
    for a in (.62, -.62):
        M = Matrix.Translation(Vector((u0, y0, 0))) @ Matrix.Rotation(a, 4, 'Z')
        blade = [(-.018, -.36), (.018, -.36), (.018, .3), (0, .36), (-.018, .3)]
        guard = [(-.09, -.26), (.09, -.26), (.09, -.23), (-.09, -.23)]
        prism('blade', blade, -.03, .03, 'Bronze', M=M, axis=axis)
        prism('guard', guard, -.04, .04, 'Bronze', M=M, axis=axis)
    prism('shield', [(u0 + x, y0 + y) for x, y in sh], -.06, .06, 'Bronze', axis=axis)


def trade_sign(kind):
    if kind == 'armoury':
        # hung in the door bay's arch from its crown: chains, a board facing the avenue
        for x in (-.36, .36): box('chain', x - .012, x + .012, -.5, 0, -.012, .012, 'Bronze')
        box('board', -.46, .46, -1.1, -.5, -.025, .025, 'Boards')
        box('board rim', -.48, .48, -.52, -.48, -.035, .035, 'Bronze')
        _shield((0, -.8))
        return
    box('wall plate', -.1, .1, -.55, .12, -.02, .03, 'Bronze')
    box('arm', -.025, .025, 0, .05, 0, 1.18, 'Bronze')
    lathe('arm knob', [(.035, 0, True), (.05, .05, False), (0, .1, True)], 'Bronze', seg=8, M=Matrix.Translation(Vector((0, .025, 1.18))) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    scroll_console('arm scroll', 0, -.5, 0, .55, .03, 'Bronze')
    for zc in (.32, 1.08): box('chain', -.01, .01, -.36, 0, zc - .01, zc + .01, 'Bronze')
    box('board', -.025, .025, -1.08, -.36, .28, 1.12, 'Boards')
    box('board rim', -.035, .035, -.38, -.34, .26, 1.14, 'Bronze')
    {'bakery': _sheaf, 'inn': _cup, 'auction': _balance}[kind]()


# THE BAKERY BOARD (cap1: "bread queues chalked on the bakery board"): an A-frame
# slate on the street before the bakery door. The empty city's is the night's
# queue -- a name and its tally, row under row, the last strokes never crossed off;
# the returned city's is the morning's list -- the breads and their counts. The
# chalk is cut a few millimetres proud of the slate (no texture: the strokes are
# the module's). Origin at its foot, the chalked face +z (to the street).
def bakery_board(state):
    tilt = math.atan2(.3, 1.1)
    for side in (1, -1):
        M = Matrix.Translation(Vector((0, 1.1, 0))) @ Matrix.Rotation(-tilt * side, 4, 'X') @ Matrix.Rotation(0 if side > 0 else math.pi, 4, 'Y')
        with at(M=M):
            box('slate', -.32, .32, -1.06, -.1, -.012, .012, 'Slate')
            for x0, x1, y0, y1 in ((-.36, -.32, -1.14, -.04), (.32, .36, -1.14, -.04), (-.36, .36, -.1, -.04), (-.36, .36, -1.1, -1.04)):
                box('frame', x0, x1, y0, y1, -.022, .022, 'Wood')
            if side < 0: continue
            # the board reads left to right in the game: the runtime draws every module
            # mirrored left-right (save()'s HANDEDNESS note), so the chalk is laid mirrored
            def stroke(x, y, h, a=0.0, wd=.012):
                Mz = Matrix.Translation(Vector((-x, y, 0))) @ Matrix.Rotation(-a, 4, 'Z')
                box('chalk', -wd / 2, wd / 2, -h / 2, h / 2, .012, .016, 'Ceramic', M=Mz)
            def dash(x0, x1, y): box('chalk', -x1, -x0, y - .008, y + .008, .012, .016, 'Ceramic')
            dash(-.22, .22, -.19); dash(-.25, .25, -.235)
            if state == 'e':
                for r, (groups, extra) in enumerate(((3, 2), (2, 4), (3, 0), (1, 3), (2, 1))):
                    y = -.34 - .15 * r
                    dash(-.28, -.12, y)
                    x = -.07
                    for g in range(groups):
                        for i in range(4): stroke(x + .022 * i, y, .085)
                        stroke(x + .033, y, .12, a=1.05, wd=.01)
                        x += .115
                    for i in range(extra): stroke(x + .022 * i, y, .085)
            else:
                for r, (a, b, n) in enumerate(((.12, .1, 2), (.16, .06, 3), (.09, .12, 1), (.14, .08, 2), (.11, .1, 3))):
                    y = -.34 - .15 * r
                    dash(-.28, -.28 + a, y); dash(-.28 + a + .04, -.28 + a + .04 + b, y)
                    for i in range(n): stroke(.18 + .03 * i, y, .085)
    for x in (-.34, .34): box('hinge', x - .03, x + .03, 1.06, 1.14, -.03, .03, 'Bronze')


# THE SHELLS (as the Hall's: Philip's performance gate). What never switches LOD is
# one module a building and city state -- the Archive's podium, portico, entablature,
# pediment, walls, open door, leads, far room, banners and braziers; the Chapel's
# podium, portico, block, rotunda and lamps (the Chapel is the same in both cities,
# its door shut on the hall of lamps). Columns, the roof balustrade, the tower and the
# domes switch LOD and stay instanced (zones/capital_civic.ts).
def front_parts(part, depth_runs, W=SF_W / 2, back=True):
    """A small temple front's shared parts, in the building's frame (origin the
    podium's front face on the axis, +z out): the entablature front and its returns
    down the sides (`depth_runs` pieces of `cent` to the back, or to the block), the
    corners, the portico's coffers. capital_civic.ts frontParts lists the same."""
    POD = 1.6; COL_TOP = POD + 10.0; HP = math.pi / 2
    n, run, bk = depth_runs
    part('front_cent', 0, COL_TOP, -.85)
    for sx in (-1, 1):
        rot = -HP if sx < 0 else HP
        for k in range(n): part('cent', sx * W, COL_TOP, -.85 - run / 2 - run * k, rot, (run / 4, 1, 1))
        part('cent_cnr', sx * W, COL_TOP, -.85, -HP if sx < 0 else 0)
        if back: part('cent_cnr', sx * W, COL_TOP, -.85 - run * n, math.pi if sx < 0 else HP)
    for k in range(3): part('coffers', -bk + bk * k, COL_TOP, -3.95, 0, (bk / 4, 1, 1.5))


def archive_shell_parts(state):
    W, POD, DEPTH = SF_W / 2, 1.6, 27.0
    COL_TOP = POD + 10.0; ENT_TOP = COL_TOP + 2.4; HP = math.pi / 2
    bk = SF_W / 3
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, tuple(axes)))
    part('archive_podium', 0, 0, 0)
    front_parts(part, (6, 4.36, bk))
    for k in range(3): part('cent', -W + bk / 2 + bk * k, COL_TOP, -DEPTH, math.pi, (bk / 4, 1, 1))
    part('archive_ped', 0, ENT_TOP, -.85)
    part('cella_door_open', 0, POD, -7)
    for sx in (-1, 1): part('cella_bay', sx * (3 + 2.15), POD, -7, 0, (1.075, 1, 1))
    for sx in (-1, 1):
        for k in range(5): part('cella_bay', sx * W, POD, -7.6 - 1.94 - 3.88 * k, -HP if sx < 0 else HP, (.97, 1, 1))
    bw = 2 * (W - .6) / 3
    for k in range(3): part('cella_bay', -(W - .6) + bw / 2 + bw * k, POD, -DEPTH, math.pi, (bw / 4, 1, 1))
    for j in range(3):
        for k in range(5): part('roof_deck', -bk + bk * j, ENT_TOP - .02, -7 - 4 * k, 0, (bk / 4, 1, 1))
    part('archive_roof', 0, ENT_TOP - .02, -17)
    part('archive_room_far', 0, POD, -7.6)
    for u, f in LAYOUT['archive']['banners'][state]: part(f, u, COL_TOP - 6.25, -1.5, 0, (.85, 1, 1))
    for sx in (-1, 1): part('brazier' if state == 'r' else 'brazier_cold', sx * (W - .45), POD + .4, 2.9)
    return P


def chapel_shell_parts():
    W, POD, PW, DEPTH = SF_W / 2, 1.6, 12.0, 33.0
    COL_TOP = POD + 10.0; ENT_TOP = COL_TOP + 2.4; HP = math.pi / 2
    bk = SF_W / 3
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, tuple(axes)))
    part('chapel_podium', 0, 0, 0)
    front_parts(part, (3, 4.05, bk), back=False)
    part('chapel_ped', 0, ENT_TOP, -.85)
    part('cella_door', 0, POD, -7)
    for sx in (-1, 1): part('cella_bay', sx * (3 + 2.15), POD, -7, 0, (1.075, 1, 1))
    for sx in (-1, 1): part('cella_bay', sx * W, POD, -7.6 - 2.7, -HP if sx < 0 else HP, (1.35, 1, 1))
    for j in range(3):
        for k in range(2): part('roof_deck', -bk + bk * j, ENT_TOP - .02, -7 - 4 * k, 0, (bk / 4, 1, 1))
    part('chapel_rotunda', 0, POD, -20)
    for u, v in ((-PW + 1.1, -1.2), (PW - 1.1, -1.2), (-PW + 1.1, -DEPTH + 1.2), (PW - 1.1, -DEPTH + 1.2)): part('chapel_lamp', u, POD, v)
    return P


# ======================================================================== THE EXCHANGE (2026-10-11)
# The Crown's auction house on the square's east side, facing the Hall across the
# fountain (Philip's auction-house ruling: a prominent building where players crowd,
# in the city's own language, one emblem in every city). capital-layout.json
# `exchange` is the plan and its `about` the brief; zones/capital_exchange.ts plans
# where every piece stands and derives the colliders from the same datums, and its
# part list is exch_shell_parts' (the node test holds the two equal). The Hall's
# civic order in a stoa's form: a five-step podium the front's width, an octastyle
# colonnade two deep with NO pediment (the square's one temple front stays the
# Hall's), a court open to the sky walled in the Hall's blind arcading, the brokers'
# aisle at the back, and the TOWER -- the Archive's rolls tower in family, 0.9 m
# lower -- carrying the auction house's balance on all four faces over the roofs.
# What switches (the columns, the front balustrade, the tower) stays instanced; the
# rest is one merged shell per city state, as the Hall's.
import auction_emblem
EXG = LAYOUT['exchange']
EX_TOWER = {'half': 3.5, 'shaft': 3.3, 'rustic': 6.1, 'ent': 17.2, 'stage': (18.3, 22.9), 'stageHalf': 2.9, 'top': 24.6,
            'emblem': 1.9, 'board_emblem': (1.35, 8.3)}


def emblem(r, M=None, sides=True, field='Copper', ring='Trim', device='Gilt', segs=24, back=False):
    """THE AUCTION HOUSE'S EMBLEM in the Capital's materials: the shared roundel
    (tools/assets/auction_emblem.py, the map's balance) as relief -- a verdigris
    copper field, a limestone ring, the balance in gilt, the crown's gold by day.
    Origin the roundel's centre on its back plane, +z out of the wall; `sides`
    False lays the ring and balance flat (a small plaque whose relief nobody sees).
    The balance is symmetric, so the runtime's left-right mirror (save()'s
    HANDEDNESS) leaves it as drawn."""
    surf = {'field': field, 'ring': ring, 'device': device}
    for part, poly, n in auction_emblem.emblem_faces(r, depth=max(.05, r * .06), relief=max(.04, r * .05), segs=segs, back=back, sides=sides):
        mesh('emblem ' + part, poly, [tuple(range(len(poly)))], surf[part], facing=n, M=M)


def EX_CORNICE():
    """The court's cornice: the civic entablature's three bands -- architrave,
    frieze, a cyma-crowned cornice -- without its dentils and modillions (seen from
    the court floor 11 m below, where the outward `cent` is seen from the square)."""
    return [(0, 0), (.06, 0), (.06, .32), (.1, .34), (.1, .78), (.04, .8), (.04, 1.62)] + cyma(.04, 1.62, .22, 1.8, 3, recta=False) + \
        [(.24, 1.82), (.7, 1.82), (.7, 2.06)] + cyma(.7, 2.06, .82, 2.34, 3) + [(.82, 2.4), (0, 2.4)]


def exch_podium():
    E = EXG
    podium(2 * E['halfW'], E['depth'], E['podium'], E['treads'], flags=True)


def exch_fabric():
    """What the Exchange's shell has of its own, in its frame (origin the podium's
    front face on the axis, x across, +z out to the square): the court's cornice
    round three sides and along the aisle's colonnade, the antae closing the side
    walls behind the colonnade, the wall tops' infill under lead, the lead flats
    under the copper hips, and the plain parapets down the sides and across the
    back (the front's is the instanced balustrade)."""
    E = EXG
    W, D, POD = E['halfW'], E['depth'], E['podium']
    COL_TOP = POD + 10.0; ENT_TOP = COL_TOP + 2.4
    side, back = W - E['wall'], -D + E['wall']
    front, court, aisle = E['colV'][0] + .75, E['colV'][1] - .75, E['back']['colV'] + .75
    T = E['tower']['half']
    # the court's cornice, one mitred run: the aisle's colonnade west of the tower,
    # up the south wall, across the colonnade's inner row, down the north wall, and
    # the aisle's colonnade east of the tower; its face toward the court
    pts = [(-T, aisle), (-side, aisle), (-side, court), (side, court), (side, aisle), (T, aisle)]
    nrm = [(0, 0, 1), (1, 0, 0), (0, 0, -1), (-1, 0, 0), (0, 0, 1)]
    sweep('court cornice', EX_CORNICE(), path_frames([Vector((u, COL_TOP, v)) for u, v in pts], [Vector(n) for n in nrm]), 'Trim')
    # the antae: the side walls' ends behind the colonnade's last row, a flat pier
    # with the blind arcading's base and capital, so the 1.2 m wall never shows its cut
    wf = E['wallFrom']
    for s in (-1, 1):
        xa, xb = sorted((s * (side - .05), s * (W + .05)))
        box('anta', xa, xb, 0, 10.0, wf, wf + .1, 'Trim', M=Matrix.Translation(Vector((0, POD, 0))))
        box('anta base', xa - .06, xb + .06, POD, POD + .5, wf - .02, wf + .16, 'Trim')
        box('anta capital', xa - .08, xb + .08, COL_TOP - .45, COL_TOP, wf - .02, wf + .2, 'Trim')
    # the wall tops between the outward entablature and the court's cornice: ashlar
    # under a lead coping (seen from the walls, the palace terrace and the air)
    for s in (-1, 1):
        xa, xb = sorted((s * side, s * W))
        box('wall top', xa, xb, COL_TOP, ENT_TOP - .03, -D, wf, 'Ashlar')
    box('back wall top', -W, W, COL_TOP, ENT_TOP - .03, -D, back, 'Ashlar')
    # the lead flats the copper hips stand on: the colonnade's and the aisle's roofs
    # (the coffers are single-sided soffits; from above, the leads)
    box('colonnade leads', -W + .05, W - .05, ENT_TOP - .06, ENT_TOP - .03, court, front, 'Lead')
    box('aisle leads', -side, side, ENT_TOP - .06, ENT_TOP - .03, -D + .05, aisle, 'Lead')
    # the parapets: a plain blocking course on the entablature's top, down both sides
    # from the front's balustrade and across the back (the tower rises through it)
    for s in (-1, 1):
        xa, xb = sorted((s * (W - .75), s * (W - .25)))
        box('parapet', xa, xb, ENT_TOP, ENT_TOP + .62, -D + .25, front + .2, 'Trim', bevel=.015)
        box('parapet cap', xa - .05, xb + .05, ENT_TOP + .62, ENT_TOP + .72, -D + .2, front + .25, 'Trim', bevel=.01)
    for s in (-1, 1):
        xa, xb = sorted((s * T, s * (W - .75)))
        box('parapet', xa, xb, ENT_TOP, ENT_TOP + .62, -D + .25, -D + .75, 'Trim', bevel=.015)
        box('parapet cap', xa, xb, ENT_TOP + .62, ENT_TOP + .72, -D + .2, -D + .8, 'Trim', bevel=.01)


def exch_tower():
    """THE EXCHANGE'S TOWER: the Archive's rolls tower in family (banded rustication,
    an ashlar shaft with corner pilasters and one sash a face over the roofs, the
    entablature, a top stage, a blocking course with urns and a small ribbed
    verdigris dome -- no cone, no belfry), standing on the podium at the back of the
    court, 0.9 m lower than the Archive's so the city keeps one first tower. Its top
    stage carries THE AUCTION HOUSE'S BALANCE on all four faces, where the Archive's
    carries its clock: the roundel's 3.8 m reads above every roof from the avenue,
    the square, Survey Street and the ward streets. On the court face, over the
    board, a second, 2.7 m roundel at the brokers' level is what the colonnade's wide
    middle bay frames from the square. Origin at its foot on the podium's top; face 0
    (+z) to the court. LOD1 keeps every silhouette element and lays the roundels'
    relief flat."""
    X = EX_TOWER
    T, S, sh = X['half'], X['shaft'], X['stageHalf']
    y_ent, (s0, s1), top = X['ent'], X['stage'], X['top']
    box('socle', -T - .12, T + .12, -.3, .4, -T - .12, T + .12, 'Trim')
    box('rustic shaft', -T, T, .4, X['rustic'], -T, T, 'Rustic')
    box('shaft', -S, S, X['rustic'], y_ent, -S, S, 'Ashlar')
    if lod():
        box('string', -T - .08, T + .08, X['rustic'], X['rustic'] + .2, -T - .08, T + .08, 'Trim')
        box('entablature', -S - .5, S + .5, y_ent, y_ent + H_ENT, -S - .5, S + .5, 'Trim')
    else:
        sweep('plinth', PLINTH(), square_frames(T, .4), 'Trim', closed=True)
        sweep('string', STRING(), square_frames(T, X['rustic']), 'Trim', closed=True)
        sweep('entablature', ENT(), square_frames(S, y_ent), 'Trim', closed=True)
    sash = (13.6, 16.2)
    for k in range(4):
        with at(M=quarter(k, S)):
            card('sash', -.6, .6, sash[0], sash[1], .012, 'Glass')
            if not lod():
                sweep('architrave', [(0, 0), (.1, 0), (.1, .16), (.06, .22), (0, .22)], face_frame(-.6, .6, sash[0], sash[1], 0), 'Trim')
                box('sill', -.9, .9, sash[0] - .2, sash[0], 0, .2, 'Trim', bevel=.015)
                box('hood', -.95, .95, sash[1] + .22, sash[1] + .42, 0, .26, 'Trim', bevel=.015)
                prism('hood pediment', [(-.95, sash[1] + .42), (.95, sash[1] + .42), (0, sash[1] + .86)], 0, .22, 'Trim')
                for sx in (-1, 1):
                    xa, xb = sorted((sx * (S - .55), sx * (S + (.12 if sx > 0 else 0))))
                    box('pilaster', xa, xb, X['rustic'] + .2, y_ent - .2, 0, .12, 'Trim')
        # the stage's face: the balance in its roundel, the whole face its field's frame
        with at(M=quarter(k, sh, (s0 + s1) / 2)):
            emblem(X['emblem'], sides=not lod(), segs=24 if not lod() else 16)
    box('stage', -sh, sh, s0, s1, -sh, sh, 'Ashlar')
    if lod():
        box('cornice', -sh - .5, sh + .5, s1, s1 + H_ENT, -sh - .5, sh + .5, 'Trim')
    else:
        sweep('cornice', ENT(), square_frames(sh, s1), 'Trim', closed=True)
    box('blocking', -sh, sh, s1 + H_ENT, top, -sh, sh, 'Ashlar')
    quad('leads', [(-sh, top, sh), (sh, top, sh), (sh, top, -sh), (-sh, top, -sh)], 'Lead', (0, 1, 0))
    if not lod():
        for sx in (-1, 1):
            for sz in (-1, 1):
                lathe('urn', [(r * 1.8, yy * 1.8, h) for r, yy, h in URN], 'Trim', seg=10, cx=sx * (sh - .35), cy=top, cz=sz * (sh - .35))
    with at(y=top): dome_kit(1.9, 1.1, 8, 8)
    # the court face's roundel over the board, on the ashlar above the string course
    r2, y2 = X['board_emblem']
    with at(M=Matrix.Translation(Vector((0, y2, S)))):
        emblem(r2, sides=not lod(), segs=24 if not lod() else 16)


def exch_counter():
    """A broker's counter: a limestone base with a moulded plinth, a honey-oak top,
    the day's ledger open on it and a small bronze balance; on the back wall over the
    broker's head the emblem as a small plaque. Origin the counter's middle on the
    floor, its front (+z) to the court; the back wall's inner face is 3.95 m behind
    it (capital-layout.json exchange: counters at v -23.75, the wall at -27.7)."""
    box('counter body', -1.3, 1.3, 0, .92, -.35, .35, 'Ashlar', bevel=.02)
    box('counter plinth', -1.34, 1.34, 0, .16, -.39, .39, 'Trim', bevel=.015)
    box('counter top', -1.36, 1.36, .92, 1.0, -.42, .42, 'Wood', bevel=.012)
    box('counter panel', -1.0, 1.0, .26, .78, .35, .37, 'Trim', bevel=.01)
    box('ledger', -.62, -.08, 1.0, 1.04, -.12, .22, 'Leather')
    box('ledger leaves', -.6, -.1, 1.04, 1.05, -.1, .2, 'Canvas')
    # the balance (the emblem's own, in bronze): a post on a foot, the beam, two pans
    box('balance foot', .38, .62, 1.0, 1.03, -.12, .12, 'Bronze')
    box('balance post', .48, .52, 1.03, 1.36, -.02, .02, 'Bronze')
    box('balance beam', .26, .74, 1.33, 1.355, -.015, .015, 'Bronze')
    for x in (.29, .71):
        box('balance cord', x - .006, x + .006, 1.18, 1.335, -.006, .006, 'Bronze')
        lathe('balance pan', [(.08, 0, True), (.08, .012, True), (.05, -.02, False), (0, -.025, True)], 'Bronze', seg=8, cx=x, cy=1.18)
    emblem(.42, M=Matrix.Translation(Vector((0, 3.1, -3.95))), sides=False, segs=16)


def exch_board(state):
    """THE BOARD on the tower's face between the counters, under the large roundel:
    a framed slate where the day's lots are pinned -- the returned city's full of
    notices, the empty city's two left up the night it stopped, one hanging by a
    corner. Origin on the tower's face at the floor, its face +z to the court."""
    box('board frame', -1.6, 1.6, .7, 2.9, 0, .1, 'Wood', bevel=.02)
    box('board field', -1.48, 1.48, .82, 2.78, .1, .12, 'Slate')
    box('board ledge', -1.66, 1.66, .64, .72, 0, .2, 'Wood', bevel=.01)
    notices = [(-1.2, 2.3, .5, .36, 0), (-.55, 2.38, .44, .3, .04), (.1, 2.32, .5, .4, -.03), (.75, 2.36, .46, .32, .02),
               (-1.15, 1.5, .44, .5, .03), (-.5, 1.56, .5, .36, -.02), (.2, 1.5, .44, .44, 0), (.85, 1.55, .5, .38, .05),
               (-.25, 1.05, .6, .3, .01)] if state == 'r' else [(-.9, 2.2, .5, .4, .02), (.6, 1.4, .46, .36, .5)]
    for x, y, w, h, a in notices:
        M = Matrix.Translation(Vector((x + w / 2, y + h / 2, .125))) @ Matrix.Rotation(a, 4, 'Z')
        box('notice', -w / 2, w / 2, -h / 2, h / 2, 0, .006, 'Canvas', M=M)
        box('pin', -.02, .02, h / 2 - .06, h / 2 - .02, .006, .02, 'Bronze', M=M)


def exch_shell_parts(state):
    """The shell's parts in the Exchange's frame, in order: zones/capital_exchange.ts
    exchangeShellParts lists the same (the node test holds the two equal)."""
    E = EXG
    W, D, POD = E['halfW'], E['depth'], E['podium']
    COL_TOP = POD + 10.0; HP = math.pi / 2
    side, back = W - E['wall'], -D + E['wall']
    front, court, aisle = E['colV'][0] + .75, E['colV'][1] - .75, E['back']['colV'] + .75
    T = E['tower']['half']
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, tuple(axes)))
    part('exch_podium', 0, 0, 0)
    part('exch_fabric', 0, 0, 0)
    for k in range(7): part('cent', -W + 2 + 4 * k, COL_TOP, front)
    run = (front + D) / 7
    for sx in (-1, 1):
        for k in range(7): part('cent', sx * W, COL_TOP, front - run / 2 - run * k, -HP if sx < 0 else HP, (run / 4, 1, 1))
        part('cent_cnr', sx * W, COL_TOP, front, -HP if sx < 0 else 0)
        part('cent_cnr', sx * W, COL_TOP, -D, math.pi if sx < 0 else HP)
    for k in range(7): part('cent', -W + 2 + 4 * k, COL_TOP, -D, math.pi)
    cv, cd = (front + court) / 2, (front - court) / 4
    for k in range(7): part('coffers', -W + 2 + 4 * k, COL_TOP, cv, 0, (1, 1, cd))
    aw, av, ad = (side - T) / 2, (aisle + back) / 2, (aisle - back) / 4
    for sx in (-1, 1):
        for k in range(2): part('coffers', sx * (T + aw / 2 + aw * k), COL_TOP, av, 0, (aw / 4, 1, ad))
    wf = E['wallFrom']
    out_run, in_run = (D + wf) / 5, (back - wf) / -5
    for sx in (-1, 1):
        for k in range(5): part('cella_bay', sx * W, POD, wf - out_run / 2 - out_run * k, -HP if sx < 0 else HP, (out_run / 4, 1, 1))
    for sx in (-1, 1):
        for k in range(5): part('cella_bay', sx * side, POD, wf - in_run / 2 - in_run * k, HP if sx < 0 else -HP, (in_run / 4, 1, 1))
    bo, bi = (W - T) / 3, (side - T) / 2
    for sx in (-1, 1):
        for k in range(3): part('cella_bay', sx * (T + bo / 2 + bo * k), POD, -D, math.pi, (bo / 4, 1, 1))
    for sx in (-1, 1):
        for k in range(2): part('cella_bay', sx * (T + bi / 2 + bi * k), POD, back, 0, (bi / 4, 1, 1))
    part('exch_roof_front', 0, COL_TOP + 2.4 - .02, cv, HP)
    part('exch_roof_back', 0, COL_TOP + 2.4 - .02, (aisle - D) / 2, HP)
    for sx in (-1, 1): part('brazier' if state == 'r' else 'brazier_cold', sx * (W - .45), POD + .4, E['treads'] * E['tread'] * .57)
    return P


def merged(parts):
    builders = {name: fn for name, kind, fn, budget, lod_of, lvl, aod, extra in MODS if not lod_of}
    for f, u, y, v, rot, axes in parts:
        M = Matrix.Translation(Vector((u, y, v))) @ Matrix.Rotation(rot, 4, 'Y') @ Matrix.Diagonal((*axes, 1))
        with at(M=M): builders[f]()


# ======================================================================== THE PALACE (L4)
# The palace on the raised terrace that closes the avenue's vista, in the
# direction's hierarchy one rank over the civic buildings: a podium of eight steps
# the whole front's width, a GIANT ORDER (columns and pilasters two storeys tall,
# 11 m) with a freestanding hexastyle portico and its pediment over the keep door,
# the great DRUM of twelve windows (one a month: the palace calendar) under a
# ribbed verdigris dome some 40 m up to its lantern, and on the lantern THE GOLD
# CROWN at ~45 m, the brightest point of the city at night (capital-architecture.ts
# crown material). Two lower wings come forward either side of the forecourt (a
# court of honour), their copper hip roofs the authority colour from the air.
# zones/capital_palace.ts plans where each piece stands from the plan's `palace`
# datums (capital-layout.json), derives the colliders from the same, and lists the
# shells' parts exactly as these do (the node test holds the lists equal).
PAL = LAYOUT['palace']
P_ORDER = PAL['order']                   # the giant order: 11 m, podium top to architrave
P_GROUND = 5.2                           # the ground storey's string course
P_UP = P_GROUND + .2                     # the piano nobile's floor line
P_NOB = 1.3                              # the house nobile stretched to a palace storey (3.8 -> 4.94 m)


def palace_bay(kind='win', balc=True):
    """ONE BAY OF THE GIANT ORDER, 4 m: a rusticated ground storey with a round-headed
    window (or a door), a string course, the piano nobile's tall pedimented window with
    its balconette (the house nobile, stretched to a palace storey), and at both joints
    half of a giant pilaster from the plinth to the capital under the entablature
    (`cent`, laid over it). Origin on the floor at the facade plane, +z out."""
    hw, d, H = HW, .6, P_ORDER
    if kind == 'door':
        arch_wall('ground', -hw, hw, 1.05, 0, 2.9, P_GROUND, 0, d, 'Rustic', soffit_surf='Trim', back=False, n=12)
        quad('door', [(-1.05, 0, -.4), (1.05, 0, -.4), (1.05, 2.9, -.4), (-1.05, 2.9, -.4)], 'Door', (0, 0, 1))
        na = 4 if lod() else 10
        mesh('fanlight', [(0, 2.9, -.4)] + [(1.05 * math.cos(math.pi * i / na), 2.9 + 1.05 * math.sin(math.pi * i / na), -.4) for i in range(na + 1)],
             [tuple(range(na + 2))], 'Fan', facing=(0, 0, 1))
        box('threshold', -1.25, 1.25, 0, .1, -.6, .3, 'Trim')
        w, sp = 1.05, 2.9
    else:
        w, sp, sill = .78, 3.3, 1.2
        arch_wall('ground', -hw, hw, w, sill, sp, P_GROUND, 0, d, 'Rustic', soffit_surf='Trim', back=False, n=12)
        na = 4 if lod() else 10
        pts = [(-w, sill, -.32)] + [(w * math.cos(math.pi - math.pi * i / na), sp + w * math.sin(math.pi - math.pi * i / na), -.32) for i in range(na + 1)] + [(w, sill, -.32)]
        mesh('ground glass', pts, [tuple(range(len(pts)))[::-1]], 'Glass', facing=(0, 0, 1))
        box('ground sill', -w - .15, w + .15, sill - .12, sill, -.35, .12, 'Trim', bevel=.015)
    if not lod():
        AV = [(0, 0), (.05, 0), (.05, .12), (.09, .14), (.09, .26), (.04, .3), (0, .3)]
        sweep('archivolt', AV, arc_frames(0, sp, w, 0, math.pi, 10), 'Trim')
        sweep('plinth', CELLA_PLINTH(), run_x(-hw, hw, 0), 'Trim')
    else:
        box('plinth', -hw, hw, 0, .55, 0, .2, 'Trim')
    prism('keystone', [(-.18, sp + w - .02), (.18, sp + w - .02), (.26, sp + w + .6), (-.26, sp + w + .6)], -.05, .2, 'Gilt' if kind == 'door' else 'Trim', bevel=.012)
    # the string course and the wall between it and the nobile's floor
    box('string wall', -hw, hw, P_GROUND, P_UP, -d, 0, 'Ashlar')
    if lod(): box('string', -hw, hw, P_GROUND, P_GROUND + .2, 0, .14, 'Trim')
    else: sweep('string', STRING(), run_x(-hw, hw, P_GROUND), 'Trim')
    with at(M=Matrix.Translation(Vector((0, P_UP, 0))) @ Matrix.Diagonal((1, P_NOB, 1, 1))):
        nobile('tri' if kind != 'seg' else 'seg', balc=balc, pil=False)
    top = P_UP + H_NOB * P_NOB
    box('frieze wall', -hw, hw, top, H, -.5, 0, 'Ashlar')
    # the giant pilasters, half at each joint (two bays make one 0.9 m pilaster)
    for s in (-1, 1):
        xa, xb = sorted((s * (hw - .45), s * hw))
        if lod():
            box('giant pilaster', xa, xb, .55, H, 0, .18, 'Trim'); continue
        ei = lambda e: (xa - e, xb) if s > 0 else (xa, xb + e)
        box('pilaster base', *ei(.06), 0, .55, 0, .26, 'Trim')
        box('pilaster shaft', xa, xb, .55, H - .8, 0, .18, 'Trim')
        box('pilaster neck', *ei(.03), H - .8, H - .68, 0, .2, 'Trim')
        box('pilaster bell', *ei(.06), H - .68, H - .24, 0, .24, 'Trim')
        box('pilaster abacus', *ei(.12), H - .24, H, 0, .3, 'Trim')


def palace_corner():
    """The giant pilaster wrapped round an outer corner of the block: the front
    facade's plane z = 0 to the left (x < 0), the side's plane x = 0 behind it
    (z < 0); a hair prouder than the bays' half pilasters, so no face is shared."""
    H, p = P_ORDER, .22
    box('corner base', -.56, p + .06, 0, .6, -.56, p + .06, 'Trim', bevel=.015)
    box('corner shaft', -.5, p, .6, H - .8, -.5, p, 'Trim')
    box('corner bell', -.53, p + .04, H - .8, H - .24, -.53, p + .04, 'Trim', bevel=.012)
    box('corner abacus', -.6, p + .1, H - .24, H, -.6, p + .1, 'Trim', bevel=.012)


def palace_vestibule(W=6.0, D=12.0, H=11.0):
    """THE KEEP'S VESTIBULE behind the open great door (the empty city: the cap_keep
    portal stands before it). M1 (the L look pass: "the open door reads as a flat
    dark slab"): a 6 m box of one dark plaster tint showed no depth at all. Now a
    12 m hall in perspective: dressed flags on the floor in four bays, each bay a
    shade darker than the one before (the daylight through the door dying into the
    hall), pilasters at every bay on both walls, a coffered ceiling with beams over
    the pilasters, and at the far end a second door arch, open on darkness -- the
    way on to the throne room. Origin at the door slab's inner face on the
    podium's top, the hall -z. Seen only through the door: nothing here casts."""
    hw = W / 2
    nb = 4; bl = D / nb
    lit = [.62, .46, .33, .23]
    for i in range(nb):
        z0, z1 = -bl * i, -bl * (i + 1); t = lit[i]
        box('vestibule floor', -hw, hw, -.05, .03, z1, z0, 'Ashlar', tint=t * 1.1)
        for s_ in (-1, 1):
            mesh('vestibule side', [(s_ * hw, 0, z0), (s_ * hw, 0, z1), (s_ * hw, H, z1), (s_ * hw, H, z0)], [(0, 1, 2, 3)], 'Ashlar', facing=(-s_, 0, 0), tint=t * .85)
            xa, xb = sorted((s_ * hw, s_ * (hw - .35)))
            box('vestibule pilaster', xa, xb, 0, H - .6, z1 - .35, z1 + .35, 'Trim', tint=t)
            box('pilaster capital', min(xa, xb) - (.08 if s_ < 0 else 0), max(xa, xb) + (.08 if s_ > 0 else 0) - (0 if s_ > 0 else 0), H - .6, H - .35, z1 - .45, z1 + .45, 'Trim', tint=t)
        mesh('vestibule ceiling', [(-hw, H, z0), (hw, H, z0), (hw, H, z1), (-hw, H, z1)], [(0, 1, 2, 3)], 'Plaster', facing=(0, -1, 0), tint=t * .7)
        box('ceiling beam', -hw, hw, H - .45, H, z1 - .3, z1 + .3, 'Trim', tint=t * .8)
        for k in (-1, 1):
            box('coffer rib', k * hw / 3 - .12, k * hw / 3 + .12, H - .3, H, z1, z0, 'Trim', tint=t * .75)
    # the far wall, with the inner door arch open on the dark
    zb = -D; aw, sp = 1.5, 4.6
    G.TINT = .2      # 12 m in from the door, the light all but gone
    arch_wall('vestibule far', -hw, hw, aw, 0.0, sp, H, zb, .5, 'Ashlar', soffit_surf='Trim', back=False, n=12)
    G.TINT = 1.0
    na = 10
    pts = [(-aw, 0, zb - .5)] + [(aw * math.cos(math.pi - math.pi * i / na), sp + aw * math.sin(math.pi - math.pi * i / na), zb - .5) for i in range(na + 1)] + [(aw, 0, zb - .5)]
    mesh('inner dark', pts, [tuple(range(len(pts)))[::-1]], 'Shade', facing=(0, 0, 1))
    box('inner threshold', -aw - .2, aw + .2, 0, .08, zb - .1, zb + .4, 'Trim', bevel=.02, tint=.25)


def palace_roof(W, D):
    """The central block's roof: a terrace of dressed limestone behind the balustrade,
    the drum rising from its middle -- stone, not the houses' lead flats, which read
    grey-blue from the air (the K look pass). Origin at its middle, its top y 0."""
    box('roof terrace', -W / 2, W / 2, -.3, 0, -D / 2, D / 2, 'Ashlar')


def hip_roof(W, D, pitch=18.0):
    """A wing's low hipped roof in verdigris copper behind its balustrade, the ridge
    along z: copper is authority's colour (the direction's materials), seen from the
    terrace, the walls and the air. Origin at the eaves' middle, y 0 the eave line."""
    hx, hz = W / 2, D / 2; rise = hx * math.tan(RAD(pitch)); rz = hz - hx
    sn, cs = math.sin(RAD(pitch)), math.cos(RAD(pitch))
    for s in (-1, 1):
        quad('roof side', [(s * hx, 0, -hz), (s * hx, 0, hz), (0, rise, rz), (0, rise, -rz)], 'Copper', (s * sn, cs, 0))
        quad('roof hip', [(-hx, 0, s * hz), (hx, 0, s * hz), (0, rise, s * rz)], 'Copper', (0, cs, s * sn))
    up = Vector((0, 1, 0))
    sweep('ridge', [(-.14, -.04), (.14, -.04), (.1, .1), (-.1, .1)],
          [(Vector((0, rise, -rz)), Vector((1, 0, 0)), up), (Vector((0, rise, rz)), Vector((1, 0, 0)), up)], 'CopperRib')
    if not lod():
        for s in (-1, 1):
            for e in (-1, 1):
                p0, p1 = Vector((s * hx, 0, e * hz)), Vector((0, rise, e * rz))
                A = (p1 - p0).normalized().cross(up).normalized()
                sweep('hip rib', [(-.1, -.04), (.1, -.04), (.07, .09), (-.07, .09)], [(p0, A, up), (p1, A, up)], 'CopperRib')


def archive_roof():
    """THE ARCHIVE'S ROOF (N1, the M look pass: "from the air its roof is a flat,
    plain grey-taupe deck that looks unfinished"). The block behind the portico was
    the houses' lead flats, 14.6 x 20 m of one grey, the one civic roof in the city
    with nothing on it (the Hall's carries its dome, the Chapel's its rotunda, the
    palace's a stone terrace and its drum). Now the palace wings' low hipped roof in
    verdigris copper -- authority's colour, the direction's for civic roofs --
    behind the balustrade, its eaves 0.45 m in from the entablature's line so the
    balusters stand clear on the leads, its ridge down the building's length. Origin
    at the block's middle on the leads, the portico's open gable rear at its front."""
    hip_roof(2 * (SF_W / 2 - .45), 19.0)


def palace_crown():
    """THE GOLD CROWN on the palace lantern: the city's ORIGINAL emblem (the
    Household's banner device made solid) -- the gilt band with ten points and pearls,
    four arches closing over it onto a plain knop (crown_piece: no orb, no cross). It
    stands on a verdigris cushion seated over the lantern's cupola. At night its gilt
    burns (capital-architecture.ts gives it a crown material of its own), the
    brightest point on the skyline. Origin at the cupola's apex, the band's foot."""
    s = PAL['dome']['crownScale']
    lathe('cushion', [(0, -1.05, True), (.62 * s, -.95, False), (.98 * s, -.55, False), (1.0 * s, -.12, True), (.9 * s, 0, True), (0, 0, True)],
          'Copper', seg=24)
    crown_piece(0, s)


def great_stair():
    """THE GREAT STAIR in the city's limestone (it was the village kit's stair pieces
    under the imperial palette): two flights and a landing between the cheek walls,
    and the head landing on the terrace. The flights keep C5's lines -- the nosing line
    the colliders follow (zones/capital_palace.ts) and the cheeks' coping is drawn
    over (stair_cheek): 12 risers of 0.25 m at 0.52 m below the landing, 8 above it.
    Every tread is a dressed block with a bullnosed edge, its riser in shade; the
    landing and the head landing are flagged. Origin on the city floor at the stair's
    top edge (the terrace edge, plan greatStair.z1), x across, the foot toward -z."""
    GS = LAYOUT['greatStair']; FL = LAYOUT['terrain']['floor']; TY = LAYOUT['terrain']['terrace']['y']
    hw, hh = GS['half'], GS['head']['half']
    H = TY - FL; R = .25; T = .52
    run = lambda n: 1.08 + (n - 1) * 2.08 + 1.0                 # C5's flight runs (makeFlight's), kept
    upper = 2; lower = H - upper
    z0 = GS['z0'] - GS['z1']; zlt = z0 + run(lower); zuf = -run(upper); land = H - upper
    assert abs((zlt - z0) - (lower / R) * T) < 1e-6 and abs(-zuf - (upper / R) * T) < 1e-6, 'the risers fill the runs'
    def flight(zf, yf, n):
        for k in range(1, n + 1):
            za = zf + T * (k - 1)
            box('step', -hw, hw, W_FOOT, yf + R * k - .06, za, za + T, 'Ashlar')
            box('tread', -hw, hw, yf + R * k - .06, yf + R * k, za - .04, za + T, 'Trim', bevel=.015)
    flight(z0, 0, int(lower / R))
    box('landing', -hw, hw, W_FOOT, land - .06, zlt, zuf, 'Rustic')
    box('landing flags', -hw, hw, land - .06, land, zlt, zuf, 'Ashlar', bevel=.012)
    flight(zuf, land, int(upper / R))
    h0, h1 = GS['head']['z']
    box('head landing', -hh, hh, H - 1.5, H - .06, h0, h1, 'Rustic')
    box('head flags', -hh, hh, H - .06, H, h0 - .04, h1, 'Ashlar', bevel=.012)


def palace_shell_parts(state):
    """The central block's parts in the palace's frame (origin the podium's front face
    on the axis, +z out toward the avenue): podium, portico entablature, pediment and
    coffers, the great door (open on the vestibule in the empty city, shut on the
    morning), the giant-order bays round the block, its entablature, corners and roof
    terrace, the state's banners between the columns and braziers on the flight's
    cheeks. capital_palace.ts palaceShellParts lists the same."""
    POD, H, W, F, DEPTH = PAL['podium']['h'], P_ORDER, PAL['podium']['half'], PAL['face'], PAL['podium']['depth']
    COL_TOP = POD + H; ENT_TOP = COL_TOP + PAL['entablature']; PH = PAL['portico']['half']; DH = PAL['door']['half']; HP = math.pi / 2
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, tuple(axes)))
    part('palace_podium', 0, 0, 0)
    part('palace_cent_front', 0, COL_TOP, -.85)
    ret = (-.85 - F) / 2
    for sx in (-1, 1):
        rot = -HP if sx < 0 else HP
        for k in range(2): part('cent', sx * PH, COL_TOP, -.85 - ret / 2 - ret * k, rot, (ret / 4, 1, 1))
        part('cent_cnr', sx * PH, COL_TOP, -.85, -HP if sx < 0 else 0)
    part('palace_ped', 0, ENT_TOP, -.85)
    cw = 2 * PH / 6; cd = -.85 - F
    for k in range(6): part('coffers', -PH + cw / 2 + cw * k, COL_TOP, (-.85 + F) / 2, 0, (cw / 4, 1, cd / 4))
    part('cella_door_open' if state == 'e' else 'cella_door', 0, POD, F, 0, (1, H / 10, 1))
    if state == 'e': part('palace_vestibule', 0, POD, F - .6)
    nf = int(round((W - DH) / 4))
    for sx in (-1, 1):
        for k in range(nf): part('palace_bay', sx * (DH + 2 + 4 * k), POD, F)
    fe = (W - PH) / 3
    for sx in (-1, 1):
        for k in range(3): part('cent', sx * (PH + fe / 2 + fe * k), COL_TOP, F, 0, (fe / 4, 1, 1))
    side = (DEPTH + F - .6) / 9                               # the side slabs, behind the front one
    for sx in (-1, 1):
        rot = -HP if sx < 0 else HP
        for k in range(9): part('palace_bay', sx * W, POD, F - .6 - side / 2 - side * k, rot, (side / 4, 1, 1))
        for k in range(9): part('cent', sx * W, COL_TOP, F - 2 - 4 * k, rot)
        part('cent_cnr', sx * W, COL_TOP, F, -HP if sx < 0 else 0)
        part('cent_cnr', sx * W, COL_TOP, -DEPTH, math.pi if sx < 0 else HP)
        part('palace_corner', sx * W, POD, F, 0 if sx > 0 else -HP)
        part('palace_corner', sx * W, POD, -DEPTH, HP if sx > 0 else math.pi)
    part('cella_door', 0, POD, -DEPTH, math.pi, (1, H / 10, 1))
    bk = (W - .6 - DH) / 5
    for sx in (-1, 1):
        for k in range(5): part('palace_bay', sx * (DH + bk / 2 + bk * k), POD, -DEPTH, math.pi, (bk / 4, 1, 1))
    be = 2 * W / 12
    for k in range(12): part('cent', -W + be / 2 + be * k, COL_TOP, -DEPTH, math.pi, (be / 4, 1, 1))
    part('palace_roof', 0, ENT_TOP - .05, (F - DEPTH) / 2)
    for u, f in PAL['banners'][state]: part(f, u, COL_TOP - 6.25, PAL['portico']['front'])
    for sx in (-1, 1): part('brazier' if state == 'r' else 'brazier_cold', sx * (W - .45), POD + .4, 2.9)
    return P


def palace_wing_parts():
    """A forward wing in its own frame (origin its middle on the terrace; the court
    face x = -6 looking -x, the outer face +6, the stair end z -24): the giant order
    on the terrace without a podium, two doors on the court, the entablature round,
    the copper hip roof. The same module stands either side, the west one turned
    half round. capital_palace.ts wingParts lists the same."""
    H, (u0, u1), (v0, v1) = P_ORDER, PAL['wings']['u'], PAL['wings']['v']
    hx, hz = (u1 - u0) / 2, (v1 - v0) / 2; ENT = H + PAL['entablature']; HP = math.pi / 2
    P = []
    def part(f, u, y, v, rot=0.0, axes=(1, 1, 1)): P.append((f, u, y, v, rot, tuple(axes)))
    n = int(round(2 * hz / 4)); bl = 2 * hz / n
    doors = PAL['wings']['doors']
    for k in range(n):
        z = -hz + bl / 2 + bl * k
        part('palace_bay_door' if k in doors else 'palace_bay', -hx, 0, z, -HP, (bl / 4, 1, 1))
        part('palace_bay_plain', hx, 0, z, HP, (bl / 4, 1, 1))
        part('cent', -hx, H, z, -HP, (bl / 4, 1, 1)); part('cent', hx, H, z, HP, (bl / 4, 1, 1))
    ne = int(round((2 * hx - 1.2) / 4)); el = (2 * hx - 1.2) / ne; ec = 2 * hx / ne
    for e, rot in ((-1, math.pi), (1, 0)):
        for k in range(ne):
            part('palace_bay_plain', -hx + .6 + el / 2 + el * k, 0, e * hz, rot, (el / 4, 1, 1))
            part('cent', -hx + ec / 2 + ec * k, H, e * hz, rot, (ec / 4, 1, 1))
    for (x, z, rot) in ((-hx, -hz, math.pi), (hx, -hz, HP), (-hx, hz, -HP), (hx, hz, 0)):
        part('cent_cnr', x, H, z, rot)
        part('palace_corner', x, 0, z, rot)
    part('palace_wing_roof', 0, ENT - .05, 0)
    return P


# ======================================================================== THE WALLS (L1)
# The city's curtain, bastions, gate and the palace terrace's retaining wall, in
# the Colonnade's own stone (decisions 13: the curtain raised to ~15 m so the
# houses -- facades 12.5, ridges 14.5, pediments 13.5, belvederes <= 15 -- sit
# under it). They replace the village kit's makeRampart/makeMasonry walls, the
# Capital's #1 cost (K perf gate: ~37k thin instances, ~1M triangles in 2 draws).
# zones/capital_walls.ts plans where every piece stands and holds these datums
# equal to manifest.json `walls` (capital_layout.test.mjs).
#
# A CURTAIN BAY: origin on the survey line at the bay's middle, x along the wall,
# +z OUTWARD (off the city), y up from the ground the run stands on. The body runs
# from W_IN (inside the line) to W_OUT -- the old rampart's footprint, so the
# plan's bastion centres (on W_MID) and clearances hold. A pilaster at its -x
# joint gives the 8 m rhythm; a run is scaled along x to fill its edge exactly.
W_IN, W_OUT = -.4, 6.2
W_MID = (W_IN + W_OUT) / 2               # 2.9: the curtain centre line (capitalwalls_geom WALL_MID)
W_BAY = 8.0
W_FOOT = -2.0                            # foundations: under the field wherever it dips
W_RUS = 4.0                              # banded rusticated base, to the string course
W_COR = 13.4                             # the cornice's foot (it is 1.2 tall, out .75)
W_WALK = 15.0                            # THE WALL WALK: the curtain's height (decisions 13)
W_PAR = 16.2                             # the outer parapet's coping: breast-high on the walk
W_KERB = 15.9                            # the inner kerb parapet
W_PT = .6                                # parapet thickness
# a bastion: a sixteen-sided limestone drum on the curtain centre line, the walk
# carried into it, a stair inside from a door on the city side up to the walk
B_RO, B_RI = 8.6, 7.5                    # outer, inner apothem
B_N = 16
B_CORNICE = 18.0                         # its cornice; the roof terrace at B_TOP, a parapet over it
B_TOP = 19.2
B_PARAPET = 20.4
B_DOOR = (1.0, 3.0)                      # the city door: half width, height
B_WDOOR = (1.0, 2.6)                     # the two walk doors, at W_WALK
B_STAIR = {'u': 3.75, 'land': 2.0, 'lane': 1.0, 'half': .9, 'rise': W_WALK / 4}   # the switchback: see bastion_in
# the gate: a single-bay triumphal arch over the cap_gate passage, deeper than the
# curtain both ways so it stands proud of it inside and out
G_HALF = 16.0                            # half its width along the wall
G_Z = (-2.4, 8.6)                        # inner face, outer face (off the survey line)
G_PASS = 4.0                             # the passage's half width
G_SPRING = 7.0                           # the arch springs here; crown G_SPRING + G_PASS
G_ENT = (12.2, 13.8)                     # entablature
G_ATTIC = (13.8, 19.2)                   # the attic with the inscription
G_TOP = 19.8                             # the attic cornice's top
# the palace terrace's retaining wall: a sheer ashlar face the full five metres,
# its top the terrace, the `bal` balustrade standing on it
T_H = 5.0                                # terrace 12 over the floor 7
T_D = 4.8                                # deep enough to hold the field's one-cell rise (4.67 m) inside it
T_BAY = 4.0


def W_CORNICE():
    """The curtain's crowning cornice, 1.2 tall projecting .75: fascia, a cyma
    reversa, the dentil bed, a deep corona that throws the wall's one long shadow
    line, a cyma recta crown."""
    p = [(0, 0), (.08, 0), (.08, .30)] + cyma(.08, .30, .2, .42, 3, recta=False) + \
        [(.22, .44), (.24, .44), (.24, .58), (.68, .58), (.68, .62), (.70, .64), (.70, .86)] + \
        cyma(.70, .86, .75, 1.12, 4) + [(.75, 1.2), (0, 1.2)]
    return p


def W_STRING():
    return [(0, 0), (.14, 0)] + cyma(.14, 0, .24, .12, 3) + [(.26, .2), (.2, .3), (0, .34)]


def W_SOCLE():
    """The chamfered socle the rustication stands on: .35 proud, its top weathered."""
    return [(0, W_FOOT), (.35, W_FOOT), (.35, .45), (.2, .7), (0, .7)]


def W_COPING(w=W_PT):
    """A parapet's coping, w deep, oversailing .08 both sides, a weathered top."""
    return [(-.08, 0), (w + .08, 0), (w + .08, .1), (w, .2), (0, .2), (-.08, .1)]


def flat_pilaster(name, x0, x1, y0, y1, z, d):
    """A pilaster as LOD1 draws it: its face d proud of the wall plane z (d < 0 is
    the inner face) and its two sides, open quads on one tile of the Trim strip,
    stretched to its height -- no top, no back (the wall and the cornice are there)."""
    zf, fz = z + d, (1 if d > 0 else -1)
    h, w, dd = 1.0, (x1 - x0) / 2, abs(d) / 2
    quad(name, [(x0, y0, zf), (x1, y0, zf), (x1, y1, zf), (x0, y1, zf)], 'Trim', (0, 0, fz), uvs=[(0, 0), (w, 0), (w, h), (0, h)])
    for x, fx in ((x0, -1), (x1, 1)):
        quad(name + ' side', [(x, y0, z), (x, y0, zf), (x, y1, zf), (x, y1, z)], 'Trim', (fx, 0, 0), uvs=[(0, 0), (dd, 0), (dd, h), (0, h)])


def curtain_bay(L=W_BAY):
    """One 8 m bay of the curtain, ground (y 0) to the outer parapet's coping."""
    hl = L / 2
    o = W_OUT
    if lod():
        # LOD1: the masses -- the body (its top the walk), the parapet, the cornice's
        # shadow line; the rustication still bands its foot.
        box('body rustic', -hl, hl, W_FOOT, W_RUS, W_IN, o, 'Rustic')
        box('body', -hl, hl, W_RUS, W_WALK, W_IN, o, 'Ashlar')
        box('parapet', -hl, hl, W_WALK, W_PAR, o - W_PT, o, 'Ashlar')
        box('cornice', -hl, hl, W_COR + .4, W_COR + 1.2, o, o + .75, 'Trim')
        # THE PILASTERS STAY, as their faces only. The streets keep 45 m and more
        # off the walls, so the city sees LOD1 almost everywhere, and without them
        # the inner face was the plain dam again and a pilastered run met a plain
        # one at every cell seam outside (L1 review). As boxes each was a fifth of
        # the bay (the strip cuts every face at each 2 m tile); as open quads on
        # one stretched tile of the Trim strip (near-flat paint: stretching shows
        # nothing) a pilaster is six triangles, and the inner cornice band, its
        # face and soffit, caps the inner ones' tops.
        flat_pilaster('pilaster', -hl, -hl + 1.2, W_RUS + .34, W_COR, o, .2)
        flat_pilaster('inner pilaster', -hl, -hl + 1.0, W_RUS + .26, W_WALK - .5, W_IN, -.14)
        # and the socle's pale line along the outer foot, its face and weathered top
        # (the LOD0 run beside a LOD1 one showed it stop at the seam)
        quad('socle', [(-hl, W_FOOT, o + .35), (hl, W_FOOT, o + .35), (hl, .45, o + .35), (-hl, .45, o + .35)], 'Trim', (0, 0, 1),
             uvs=[(0, 0), (L / 2, 0), (L / 2, 1), (0, 1)])
        quad('socle top', [(-hl, .45, o + .35), (hl, .45, o + .35), (hl, .7, o), (-hl, .7, o)], 'Trim', (0, 1, 1),
             uvs=[(0, 0), (L / 2, 0), (L / 2, .2), (0, .2)])
        y0, y1, zb = W_WALK - .5, W_WALK - .1, W_IN - .26
        quad('inner band', [(-hl, y0, zb), (hl, y0, zb), (hl, y1, zb), (-hl, y1, zb)], 'Trim', (0, 0, -1),
             uvs=[(0, 0), (L / 2, 0), (L / 2, .2), (0, .2)])
        quad('inner band soffit', [(-hl, y0, W_IN), (hl, y0, W_IN), (hl, y0, zb), (-hl, y0, zb)], 'Trim', (0, -1, 0),
             uvs=[(0, 0), (L / 2, 0), (L / 2, .13), (0, .13)])
        return
    # the body, rusticated below the string course, ashlar above, both faces
    box('body rustic', -hl, hl, W_FOOT, W_RUS, W_IN, o, 'Rustic')
    box('body', -hl, hl, W_RUS, W_COR, W_IN, o, 'Ashlar')
    # the walk's top and the parapets standing on it
    box('walk', -hl, hl, W_COR, W_WALK, W_IN, o - W_PT, 'Trim')
    box('parapet', -hl, hl, W_COR, W_PAR - .2, o - W_PT, o, 'Ashlar')
    sweep('parapet coping', W_COPING(), [(Vector((-hl, W_PAR - .2, o - W_PT)), Vector((0, 0, 1)), Vector((0, 1, 0))),
                                        (Vector((hl, W_PAR - .2, o - W_PT)), Vector((0, 0, 1)), Vector((0, 1, 0)))], 'Trim')
    box('kerb', -hl, hl, W_WALK, W_KERB - .2, W_IN, W_IN + W_PT, 'Ashlar')
    sweep('kerb coping', W_COPING(), [(Vector((-hl, W_KERB - .2, W_IN)), Vector((0, 0, 1)), Vector((0, 1, 0))),
                                     (Vector((hl, W_KERB - .2, W_IN)), Vector((0, 0, 1)), Vector((0, 1, 0)))], 'Trim')
    # the outer face: socle, string course, pilaster at the joint, the cornice and
    # its dentils -- the one long shadow line the Burned Land sees
    sweep('socle', W_SOCLE(), run_x(-hl, hl, 0, o), 'Trim')
    sweep('string course', W_STRING(), run_x(-hl, hl, W_RUS, o), 'Trim')
    # the pilasters in dressed Trim, as the houses' are: coursed like the wall they
    # read only by their shadow, and LOD1's (one stretched tile) must be Trim
    box('pilaster', -hl, -hl + 1.2, W_RUS + .34, W_COR, o, o + .2, 'Trim', bevel=.02)
    box('pilaster base', -hl - .08, -hl + 1.28, W_RUS + .34, W_RUS + .7, o, o + .28, 'Trim', bevel=.015)
    sweep('cornice', W_CORNICE(), run_x(-hl, hl, W_COR, o), 'Trim')
    n = int(round(L / .4))
    for i in range(n):
        x = -hl + (i + .5) * L / n
        box('dentil', x - .09, x + .09, W_COR + .44, W_COR + .58, o + .2, o + .5, 'Trim')
    # the inner face: a lighter string course, a cornice band under the kerb and a
    # flat pilaster at the joint -- the city sees this face across every ward,
    # and plain it read as a dam (LOOKED)
    box('inner pilaster', -hl, -hl + 1.0, W_RUS + .26, W_WALK - .5, W_IN - .14, W_IN, 'Trim', bevel=.02)
    for y, prof in ((W_RUS, [(0, 0), (.16, 0), (.2, .06), (.2, .2), (0, .26)]), (W_WALK - .5, [(0, 0), (.1, 0), (.22, .14), (.26, .3), (.26, .4), (0, .4)])):
        sweep('inner band', prof, [(Vector((hl, y, W_IN)), Vector((0, 0, -1)), Vector((0, 1, 0))), (Vector((-hl, y, W_IN)), Vector((0, 0, -1)), Vector((0, 1, 0)))], 'Trim')


def curtain_cap():
    """The square end of a curtain run where it meets no bastion -- the higher run's
    end at the terrace step, where the lower walk stops against it: the socle,
    string course and cornice returned across the end face (the bay's own box
    closes it). Returned BOTH ways from the end plane, so one module serves a run
    ending toward +x or -x without a mirror (a mirror turns faces inside out);
    the copy toward the run is buried in it. Origin at the end plane."""
    # and a parapet across the end of its walk, over the drop to the lower one
    box('end parapet', -.3, .3, W_WALK, W_PAR - .2, W_IN + W_PT, W_OUT - W_PT, 'Ashlar')
    sweep('end coping', [(-.08, -.38), (.1, -.38), (.2, -.3), (.2, .3), (.1, .38), (-.08, .38)],
          [(Vector((0, W_PAR - .2, W_IN + W_PT)), Vector((0, 1, 0)), Vector((1, 0, 0))), (Vector((0, W_PAR - .2, W_OUT - W_PT)), Vector((0, 1, 0)), Vector((1, 0, 0)))], 'Trim')
    for sx in (1, -1):
        for y, prof in ((0, W_SOCLE()), (W_RUS, W_STRING()), (W_COR, W_CORNICE())):
            sweep('return', prof, [(Vector((0, y, W_OUT)), Vector((sx, 0, 0)), Vector((0, 1, 0))), (Vector((0, y, W_IN)), Vector((sx, 0, 0)), Vector((0, 1, 0)))], 'Trim')


def ring_pts(R, n=B_N, phase=0.0):
    """A regular n-gon of APOTHEM R, as (x, z), facets centred on +z and every
    360/n round it (facet k faces (sin k a, cos k a))."""
    rc = R / math.cos(math.pi / n)
    return [(rc * math.sin(phase + (k + .5) * 2 * math.pi / n), rc * math.cos(phase + (k + .5) * 2 * math.pi / n)) for k in range(n)]


def facet_frame(k, n=B_N):
    """The frame of facet k: +z out through its middle."""
    a = k * 2 * math.pi / n
    return a, Matrix.Rotation(a, 4, 'Y')


def ring_shell(name, y0, y1, Ro, surf, n=B_N):
    """A drum's outer faces only, and its top annulus' outer rim: what LOD1 shows
    of a band once its doors are painted shut (nothing inside can be seen)."""
    po = ring_pts(Ro, n)
    vs = [(x, y, z) for x, z in po for y in (y0, y1)]
    mesh(name, vs, [(2 * k, 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1, 2 * k + 1) for k in range(n)], surf, radial=(0, 0, 1))


def ring_band(name, y0, y1, Ro, Ri, surf, skip=(), n=B_N):
    """A ring of facets from y0 to y1 between apothems Ri and Ro, as ONE solid per
    unbroken run of facets (outer and inner faces, top, bottom, and end faces where
    a run stops at a door) -- sixteen separate slabs drew thirty-two faces between
    them that nobody sees. `skip`: the facets the caller builds itself."""
    po, pi = ring_pts(Ro, n), ring_pts(Ri, n)
    keep = [k for k in range(n) if k not in skip]
    if not keep: return
    # runs of consecutive facets (cyclic); a full ring is one closed run
    runs = []
    if len(keep) == n: runs = [list(range(n))]
    else:
        start = next(k for k in keep if (k - 1) % n not in keep)
        k = start; cur = []
        for _ in range(n):
            if k in keep: cur.append(k)
            elif cur: runs.append(cur); cur = []
            k = (k + 1) % n
        if cur: runs.append(cur)
    for run in runs:
        closed = len(run) == n
        corners = [(run[0] - 1) % n] + run   # facet k spans corners k-1 .. k
        if closed: corners = run
        m = len(corners)
        vs = []
        for c in corners:
            for y in (y0, y1): vs += [(po[c][0], y, po[c][1]), (pi[c][0], y, pi[c][1])]
        # vertex 4j + (0 outer low, 1 inner low, 2 outer high, 3 inner high)
        fs = []
        segs = m if closed else m - 1
        for j in range(segs):
            a, b = 4 * j, 4 * ((j + 1) % m)
            fs += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a + 2, b + 2, b + 3, a + 3), (a, a + 1, b + 1, b)]
        if not closed:
            e = 4 * (m - 1)
            fs += [(0, 2, 3, 1), (e, e + 1, e + 3, e + 2)]
        mesh(name, vs, fs, surf, solid=True)


def facet_door(name, k, y0, y1, dw, dh, Ro, Ri, surf, n=B_N):
    """Facet k from y0 to y1 with a door dw wide (half) and dh tall from y0: two
    jambs to the facet's corners and the lintel over it, the reveal in plaster."""
    a, M = facet_frame(k, n)
    po, pi = ring_pts(Ro, n), ring_pts(Ri, n)
    # the facet's corners in its own frame (x across, z out)
    Mi = M.inverted()
    def loc(p): v = Mi @ Vector((p[0], 0, p[1])); return (v.x, v.z)
    oa, ob, ia, ib = loc(po[k - 1]), loc(po[k]), loc(pi[k - 1]), loc(pi[k])
    # corner k-1 is the facet's -x end (its local x = -rc sin(pi/n))
    left = [oa, (-dw, oa[1]), (-dw, ia[1]), ia]
    right = [(dw, ob[1]), ob, ib, (dw, ib[1])]
    for side in (left, right):
        prism(name + ' jamb', side, y0, y1, surf, axis='y', M=M)
    prism(name + ' lintel', [oa, ob, ib, ia], y0 + dh, y1, surf, axis='y', M=M)


def bastion(lvl=0):
    """A BASTION: a sixteen-sided limestone drum, its walls B_RO - B_RI thick,
    rusticated to the string course, a band at the curtain's cornice, ashlar to its
    own cornice, a roof terrace behind a parapet and a copper-domed sentry kiosk on
    it (the direction's 'bastion sentry kiosks'). Origin at its centre on the
    ground; +z is OUTWARD along the bisector of its corner, so the city door is the
    facet at -z (k 8) and the two walk doors the facets at +-112.5 deg (k +-5), where
    the curtains' centre lines run in. Symmetric about x = 0: no mirrored placing."""
    walk = {5, 11}; city = 8
    if lvl:
        # LOD1 (past 45 m: nobody walks in from there): the shell as two solids and
        # its doors painted on them -- as what LOD0's open door shows, the stair hall
        # behind it in its own light (the spine wall and the treads, a pale ashlar
        # a shade down), not as 'Shade': painted black, the city door read as a
        # pitch-black hole at the drum's foot from every ward street (N1, the M look
        # pass), and LOD0 swapped it for a lit room at 45 m
        for k, (dw, y0, dh) in ((city, (B_DOOR[0], 0, B_DOOR[1])), *((k, (B_WDOOR[0], W_WALK, B_WDOOR[1])) for k in walk)):
            a, M = facet_frame(k)
            mesh('door', [(-dw, y0, B_RO + .01), (dw, y0, B_RO + .01), (dw, y0 + dh, B_RO + .01), (-dw, y0 + dh, B_RO + .01)], [(0, 1, 2, 3)],
                 'Ashlar', M=M, facing=(0, 0, 1), tint=.45)
            # and its pale Trim surround, the jambs and the lintel LOD0's opening
            # shows in the rustication: without it the dimmed quad read as a flat
            # panel on the stone rather than a way in (the N1 review)
            fw, z = .3, B_RO + .012
            for xa, xb, ya, yb in ((-dw - fw, -dw, y0, y0 + dh), (dw, dw + fw, y0, y0 + dh), (-dw - fw, dw + fw, y0 + dh, y0 + dh + fw)):
                mesh('door frame', [(xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z)], [(0, 1, 2, 3)], 'Trim', M=M, facing=(0, 0, 1))
        ring_shell('foot', W_FOOT, W_RUS, B_RO, 'Rustic')
        ring_shell('wall', W_RUS, B_PARAPET - .15, B_RO, 'Ashlar')
    else:
        # the shell, band by band (the door facets their own)
        ring_band('foot', W_FOOT, W_RUS, B_RO, B_RI, 'Rustic', skip={city})
        facet_door('city door', city, W_FOOT, W_RUS, B_DOOR[0], B_DOOR[1] - W_FOOT, B_RO, B_RI, 'Rustic')
        ring_band('wall', W_RUS, W_WALK, B_RO, B_RI, 'Ashlar')
        ring_band('walk storey', W_WALK, B_TOP, B_RO, B_RI, 'Ashlar', skip=walk)
        for k in walk: facet_door('walk door', k, W_WALK, B_TOP, B_WDOOR[0], B_WDOOR[1], B_RO, B_RI, 'Ashlar')
    # the roof terrace slab (its underside the upper room's ceiling) and parapet
    pi = ring_pts(B_RI); po = ring_pts(B_RO)
    if lvl:
        mesh('terrace', [(x, B_TOP, z) for x, z in ring_pts(B_RO - .55)], [tuple(range(B_N))], 'Trim', facing=(0, 1, 0))
        pr = ring_pts(B_RO - .55)
        mesh('parapet in', [(x, y, z) for x, z in pr for y in (B_TOP, B_PARAPET - .15)],
             [(2 * k, 2 * k + 1, 2 * ((k + 1) % B_N) + 1, 2 * ((k + 1) % B_N)) for k in range(B_N)], 'Ashlar', radial=(0, 0, -1))
    else:
        prism('terrace', pi, B_TOP - .3, B_TOP, 'Trim', axis='y')
        ring_band('parapet', B_TOP, B_PARAPET - .15, B_RO, B_RO - .55, 'Ashlar')
    nrm = [Vector((math.sin(k * 2 * math.pi / B_N), 0, math.cos(k * 2 * math.pi / B_N))) for k in range(B_N)]
    def ring_sweep(name, prof, R, y, surf='Trim', gap=None):
        P = [Vector((x, y, z)) for x, z in ring_pts(R)]
        if gap is None:
            # facet k runs corner k-1 -> k, so segment i (corner i -> i+1) faces facet i+1
            sweep(name, prof, path_frames(P, [nrm[(i + 1) % B_N] for i in range(B_N)], closed=True), surf, closed=True)
            return
        # open across a door: from the door's right jamb round to its left one
        k, dw = gap
        a, M = facet_frame(k)
        ends = [M @ Vector((dw, y, R)), M @ Vector((-dw, y, R))]
        pts = [ends[0]] + [P[(k + j) % B_N] for j in range(B_N)] + [ends[1]]
        ns = [nrm[k]] + [nrm[(k + 1 + j) % B_N] for j in range(B_N - 1)] + [nrm[k]]
        sweep(name, prof, path_frames(pts, ns), surf)
    if lvl:
        # the cornice alone: on a drum a horizontal moulding is cut at every 2 m
        # tile line it crosses (the atlas strips), so the socle, string course
        # and coping were 900 of LOD1's 2,000 triangles for lines nobody reads at
        # 45 m; the rustic-to-ashlar change still marks the base
        ring_sweep('cornice', [(0, 0), (.7, .6), (.7, 1.2), (0, 1.2)], B_RO, B_CORNICE)
    else:
        ring_sweep('socle', W_SOCLE(), B_RO, 0, gap=(city, B_DOOR[0] + .12))
        ring_sweep('string', W_STRING(), B_RO, W_RUS)
        ring_sweep('curtain band', [(0, 0), (.1, 0), (.22, .14), (.26, .3), (.26, .5), (0, .5)], B_RO, W_COR + .5)
        ring_sweep('cornice', W_CORNICE(), B_RO, B_CORNICE)
        ring_sweep('coping', [(-.08, 0), (.63, 0), (.63, .1), (.55, .2), (0, .2), (-.08, .1)], B_RO - .55, B_PARAPET - .15)
        # the doors' architraves and hoods, the stair's lights
        for k, (dw, y0, dh) in ((city, (B_DOOR[0], 0, B_DOOR[1])), *((k, (B_WDOOR[0], W_WALK, B_WDOOR[1])) for k in walk)):
            a, M = facet_frame(k)
            sweep('door frame', [(0, 0), (.1, 0), (.1, .16), (.05, .22), (0, .22)], face_frame(-dw, dw, y0, y0 + dh, B_RO + .01), 'Trim', M=M)
            box('door hood', -dw - .4, dw + .4, y0 + dh + .22, y0 + dh + .42, B_RO, B_RO + .35, 'Trim', M=M, bevel=.015)
            if k == city:
                prism('door key', [(-.16, dh - .05), (.16, dh - .05), (.22, dh + .4), (-.22, dh + .4)], B_RO - .02, B_RO + .2, 'Gilt', M=M)
        for k in (0, 2, 14, 3, 13):
            a, M = facet_frame(k)
            y = 6.0 if k in (2, 14) else 9.6 if k in (3, 13) else 11.2
            # (L5: lit on the returned city's nights only, the garrison home: 'DarkR')
            quad('light', [(-.32, y, B_RO + .01), (.32, y, B_RO + .01), (.32, y + 1.3, B_RO + .01), (-.32, y + 1.3, B_RO + .01)], 'DarkR', (0, 0, 1), M=M)
            box('light sill', -.45, .45, y - .12, y, B_RO, B_RO + .14, 'Trim', M=M)
    kiosk(B_TOP)


def kiosk(y):
    """The sentry kiosk on a bastion's roof: a round copper-domed tempietto of six
    Tuscan columns on a stepped stylobate, a gilt knop on the dome (no orb, no
    cross). Copper, as the direction keeps it for domes, lanterns and these."""
    R = 2.0
    seg = 8 if lod() else 20
    if lod():
        lathe('stylobate', [(R + .5, 0, True), (R + .5, .34, True), (0, .34, True)], 'Trim', seg=seg, cy=y, caps=False)
    else:
        lathe('stylobate', [(R + .5, 0, True), (R + .5, .18, True), (R + .3, .18, True), (R + .3, .34, True), (0, .34, True)], 'Trim', seg=seg, cy=y)
    for k in range(6):
        a = 2 * math.pi * (k + .5) / 6
        cx, cz = R * math.sin(a), R * math.cos(a)
        if lod():
            box('column', cx - .14, cx + .14, y + .34, y + 2.9, cz - .14, cz + .14, 'Trim')
        else:
            lathe('column', [(.2, 0, True), (.2, .1, True), (.15, .16, False), (.14, 2.3, False), (.17, 2.36, True), (.2, 2.46, False),
                             (.24, 2.46, True), (.24, 2.56, True), (0, 2.56, True)], 'Trim', seg=8, cx=cx, cy=y + .34, cz=cz)
    ent = [(R + .44, 0, True), (R + .44, .52, True), (R - .3, .52, True), (R - .3, 0, True), (R + .44, 0, True)] if lod() else \
        [(R + .34, 0, True), (R + .34, .34, True), (R + .44, .42, False), (R + .44, .52, True), (R - .3, .52, True), (R - .3, 0, True), (R + .34, 0, True)]
    lathe('entablature', ent, 'Trim', seg=seg, cy=y + 2.9, caps=False)
    lathe('ceiling', [(0, 0, True), (R - .3, 0, True)], 'Plaster', seg=seg, cy=y + 2.92, caps=False)
    N = 3 if lod() else 9
    prof = [(R + .38 * math.cos(math.pi / 2 * i / N), 1.55 * math.sin(math.pi / 2 * i / N), i in (0, N)) for i in range(N + 1)]
    prof[-1] = (0, prof[-1][1], True)
    lathe('dome', prof, 'Copper', seg=seg, cy=y + 3.42)
    lathe('knop', [(.14, 0, True), (.08, .1, False), (.16, .24, False), (.1, .36, False), (0, .44, True)], 'Gilt', seg=8, cy=y + 3.42 + 1.5)


def clip_rect(poly, lo, hi):
    """A convex (x, z) polygon clipped to the box lo..hi (Sutherland-Hodgman)."""
    out = list(poly)
    for ax in (0, 1):
        for lim, sg in ((lo[ax], 1), (hi[ax], -1)):
            src, out = out, []
            for i in range(len(src)):
                a, b = src[i], src[(i + 1) % len(src)]
                da, db = (a[ax] - lim) * sg, (b[ax] - lim) * sg
                if da >= 0: out.append(a)
                if (da >= 0) != (db >= 0):
                    t = da / (da - db); out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def bastion_in():
    """Inside a bastion, near only (LOD0's range): the floor, a SWITCHBACK stair of
    four flights round a spine wall -- the brief's wall-walk access, 'in the
    bastions' (Regent: 'stood on the walls that night') -- landings at its ends,
    and the upper room's floor at the walk with a railed well over the stair.
    u = +z (out along the bisector), v = x. Flights 1 and 3 climb +u in the lane at
    v +1, 2 and 4 come back in the lane at v -1; every flight rises W_WALK / 4 over
    2 u (7.5 m), landings 2 m deep at u +-(3.75..5.75). The city door at -z opens
    under the 7.5 m landing onto the foot of flight 1."""
    s = B_STAIR; U, D, LN, rise = s['u'], s['land'], s['lane'], s['rise']
    pi = ring_pts(B_RI - .01)
    prism('floor', pi, -.1, .02, 'Ashlar', axis='y')
    steps = 12
    for f in range(4):
        v = LN if f % 2 == 0 else -LN
        y0 = f * rise; up = 1 if f % 2 == 0 else -1
        for i in range(steps):
            u0 = -U * up + up * 2 * U * i / steps; u1 = u0 + up * 2 * U / steps
            top = y0 + rise * (i + 1) / steps
            # flights 1 and 2 are built up from the floor; 3 and 4 fly on a .6 m slab
            bot = 0.0 if f < 2 else top - rise / steps - .6
            box('step', v - s['half'], v + s['half'], bot, top, min(u0, u1), max(u0, u1), 'Trim')
    box('spine', -.1, .1, 0, W_WALK - .9, -U, U, 'Ashlar')
    for yl, zs in ((rise, (U, U + D)), (2 * rise, (-U - D, -U)), (3 * rise, (U, U + D))):
        box('landing', -2 * LN, 2 * LN, (0.0 if yl == rise else yl - .5), yl, zs[0], zs[1], 'Trim')
    # the upper room's floor at the walk: the ring less the stair well (u -U..U+D,
    # v -2..2) -- four slabs round it -- and a solid rail on the well's edges but
    # where flight 4 arrives (u -U, v -2..0)
    for lo, hi in (((-99, -99), (-2 * LN, 99)), ((2 * LN, -99), (99, 99)), ((-2 * LN, -99), (2 * LN, -U)), ((-2 * LN, U + D), (2 * LN, 99))):
        prism('upper floor', clip_rect(pi, lo, hi), W_WALK - .4, W_WALK, 'Ashlar', axis='y')
    for x0, x1, z0, z1 in ((-2 * LN - .15, -2 * LN, -U, U + D), (2 * LN, 2 * LN + .15, -U, U + D), (-2 * LN, 2 * LN, U + D, U + D + .15), (0, 2 * LN, -U - .15, -U)):
        box('rail', x0, x1, W_WALK, W_WALK + 1.0, z0, z1, 'Trim')


def gate_niche(cx, y0, spring, w, z, surf, M=None):
    """A blind round-headed niche field on a pier face at z, a hair proud of it (the
    pier is one solid box, so a recess would need it cut): the field one n-gon,
    its arched frame swept round it by the caller."""
    n = 4 if lod() else 10
    pts = [(cx - w, y0, z + .02)] + [(cx + w * math.cos(math.pi - math.pi * i / n), spring + w * math.sin(math.pi - math.pi * i / n), z + .02) for i in range(n + 1)] + [(cx + w, y0, z + .02)]
    mesh('niche', pts, [tuple(range(len(pts)))[::-1]], surf, M=M, facing=(0, 0, 1))


def gate_face(z, out):
    """One face of the gate at z = zf (out = +1 the Burned Land's side, -1 the city's),
    built facing +z and turned half round for the city side: four engaged columns
    on pedestals, the archivolt with its gilt keystone, a blind niche and a framed
    panel in each pier, the inscription panel on the attic."""
    M = None if out > 0 else Matrix.Rotation(math.pi, 4, 'Y')
    for cx in (-14.4, -5.6, 5.6, 14.4):
        box('pedestal', cx - .95, cx + .95, 0, 2.4, z, z + .7, 'Trim', bevel=.02, M=M)
        box('pedestal cap', cx - 1.05, cx + 1.05, 2.2, 2.45, z, z + .8, 'Trim', bevel=.015, M=M)
        if lod():
            box('column', cx - .6, cx + .6, 2.45, G_ENT[0], z, z + .6, 'Trim', M=M)
            continue
        r = .62
        prof = [(r * 1.25, 0, True), (r * 1.25, .22, True), (r * 1.1, .34, False), (r, .42, True)]
        prof += [(r * (1 - .12 * (i / 6) ** 1.5), .42 + (8.6 - .42) * i / 6, False) for i in range(1, 7)]
        prof += [(r * .92, 8.62, True), (r * .98, 8.7, True), (r * 1.05, 8.82, False), (r * 1.2, 9.1, False), (r * 1.4, 9.2, True), (r * 1.4, G_ENT[0] - 2.45, True), (0, G_ENT[0] - 2.45, True)]
        lathe('column', prof, 'Trim', seg=10, cx=cx, cy=2.45, cz=z, a0=0, a1=math.pi, M=M, caps=False)
    # the archivolt and the keystone (gilt: civic keystones are, the direction says)
    if not lod():
        AV = [(0, 0), (.06, 0), (.06, .18), (.12, .22), (.12, .5), (.2, .6), (0, .62)]
        sweep('archivolt', AV, arc_frames(0, G_SPRING, G_PASS, 0, math.pi, 16, z=z), 'Trim', M=M)
        for s in (-1, 1):
            x0, x1 = sorted((s * G_PASS, s * (G_PASS + 1.2)))
            box('impost', x0, x1, G_SPRING - .35, G_SPRING, z, z + .22, 'Trim', M=M)
    prism('keystone', [(-.38, G_SPRING + G_PASS - .1), (.38, G_SPRING + G_PASS - .1), (.55, G_ENT[0]), (-.55, G_ENT[0])], z - .05, z + .32, 'Gilt', M=M)
    # the piers: a blind niche over a plinth, a framed relief panel over it
    for cx in (-10.0, 10.0):
        gate_niche(cx, 2.6, 6.4, 1.15, z, 'Plaster', M=M)
        if not lod():
            sweep('niche frame', [(0, 0), (.08, 0), (.08, .14), (0, .2)], face_frame(cx - 1.15, cx + 1.15, 2.6, 6.4, z, arch=True, nseg=8), 'Trim', M=M)
            box('niche sill', cx - 1.5, cx + 1.5, 2.3, 2.6, z, z + .3, 'Trim', M=M, bevel=.015)
        box('panel', cx - 2.2, cx + 2.2, 8.6, 11.4, z, z + .12, 'Trim', bevel=.02, M=M)
        box('panel field', cx - 1.9, cx + 1.9, 8.9, 11.1, z + .12, z + .16, 'Ashlar', M=M)
    # the inscription on the attic, framed
    # built facing +z and turned for the city side, so both read through the same
    # mirrored UVs (capital_geom 'panel_mirror': the runtime's handedness flip)
    surf = 'InscrGate'
    quad('inscription', [(-11, G_ATTIC[0] + .8, z + .23), (11, G_ATTIC[0] + .8, z + .23), (11, G_ATTIC[1] - .9, z + .23), (-11, G_ATTIC[1] - .9, z + .23)], surf, (0, 0, 1), M=M)
    box('inscription frame', -11.4, 11.4, G_ATTIC[0] + .4, G_ATTIC[1] - .5, z, z + .2, 'Trim', bevel=.02, M=M)


def gate_arch():
    """THE GATE: a single-bay triumphal arch standing across the curtain over the
    cap_gate passage -- the passage 8 m wide under an 11 m arch, engaged columns on
    pedestals, a full entablature and an attic carrying the inscription, copper
    urns on the attic over the outer columns. Origin on the survey line at the
    passage's middle, +z outward (the Burned Land), x along the wall."""
    zi, zo = G_Z; hw = G_HALF; P = G_PASS
    # the two piers and the mass over the arch
    for s in (-1, 1):
        x0, x1 = sorted((s * P, s * hw))
        box('pier rustic', x0, x1, W_FOOT, 2.4, zi, zo, 'Rustic')
        box('pier', x0, x1, 2.4, G_ENT[0], zi, zo, 'Ashlar')
    fan('spandrel', 0, G_SPRING, P, -P, P, G_ENT[0], zo, 'Ashlar', (0, 0, 1), n=16)
    fan('spandrel in', 0, G_SPRING, P, -P, P, G_ENT[0], zi, 'Ashlar', (0, 0, -1), n=16)
    soffit('vault', 0, G_SPRING, P, zo, zi, 'Plaster', n=16)
    box('attic', -hw, hw, G_ENT[0], G_ATTIC[1], zi, zo, 'Ashlar')
    # coffers along the vault (raised ribs, not modelled cells), an impost along both walls
    if not lod():
        for i in range(1, 6):
            zz = zi + (zo - zi) * i / 6
            arcp = [Vector((P * math.cos(math.pi * j / 12), G_SPRING + P * math.sin(math.pi * j / 12), zz)) for j in range(13)]
            fr = [(p, Vector((0, 0, 1)), (Vector((0, G_SPRING, zz)) - p).normalized()) for p in arcp]
            sweep('vault rib', [(-.18, 0), (.18, 0), (.18, .16), (-.18, .16)], fr, 'Trim')
        for s in (-1, 1):
            sweep('passage impost', [(0, 0), (.1, 0), (.18, .12), (.18, .3), (0, .3)],
                  [(Vector((s * P, G_SPRING - .3, zi)), Vector((-s, 0, 0)), Vector((0, 1, 0))), (Vector((s * P, G_SPRING - .3, zo)), Vector((-s, 0, 0)), Vector((0, 1, 0)))], 'Trim')
    # the entablature, the attic's base and its cornice, wrapped round all four sides
    rect = [Vector((-hw, 0, zo)), Vector((hw, 0, zo)), Vector((hw, 0, zi)), Vector((-hw, 0, zi))]
    nr = [Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 0, -1)), Vector((-1, 0, 0))]
    def wrap(name, prof, y):
        sweep(name, prof, path_frames([p + Vector((0, y, 0)) for p in rect], nr, closed=True), 'Trim', closed=True)
    # the socle round each pier -- not across the passage, where a wrapped one
    # laid a kerb from pier to pier (the openings test caught it)
    def socle(prof):
        for s_ in (-1, 1):
            pts = [Vector((s_ * P, 0, zo)), Vector((s_ * hw, 0, zo)), Vector((s_ * hw, 0, zi)), Vector((s_ * P, 0, zi))]
            ns = [Vector((0, 0, 1)), Vector((s_, 0, 0)), Vector((0, 0, -1))]
            sweep('socle', prof, path_frames(pts, ns), 'Trim')
    if lod():
        socle([(0, W_FOOT), (.3, W_FOOT), (.3, .5), (0, .5)])
        wrap('entablature', [(0, 0), (.6, .9), (.6, G_ENT[1] - G_ENT[0]), (0, G_ENT[1] - G_ENT[0])], G_ENT[0])
        wrap('attic cornice', [(0, 0), (.5, .3), (.5, G_TOP - G_ATTIC[1]), (0, G_TOP - G_ATTIC[1])], G_ATTIC[1])
    else:
        socle(W_SOCLE())
        wrap('entablature', scaled(CENT(), .7, (G_ENT[1] - G_ENT[0]) / 2.4), G_ENT[0])
        wrap('attic base', [(0, 0), (.3, 0), (.3, .2), (.18, .32), (.18, .4), (0, .4)], G_ENT[1])
        wrap('attic cornice', [(0, 0), (.08, 0)] + cyma(.08, 0, .3, .2, 3) + [(.32, .22), (.48, .3), (.5, G_TOP - G_ATTIC[1] - .06), (.44, G_TOP - G_ATTIC[1]), (0, G_TOP - G_ATTIC[1])], G_ATTIC[1])
    if not lod():   # at LOD1 the attic's own top shows, .6 m down inside its cornice
        box('attic top', -hw + .02, hw - .02, G_TOP - .06, G_TOP, zi + .02, zo - .02, 'Trim')
    gate_face(zo, 1)
    gate_face(-zi, -1)
    # copper urns on the attic over the outer face's columns: the copper accent
    for cx in (-14.4, -5.6, 5.6, 14.4):
        box('urn plinth', cx - .6, cx + .6, G_TOP, G_TOP + .5, zo - 1.3, zo - .1, 'Trim', bevel=.015)
        lathe('urn', [(r * 3.2, yy * 3.2, h) for r, yy, h in URN], 'Copper', seg=8 if lod() else 14, cx=cx, cy=G_TOP + .5, cz=zo - .7)


def bastion_batter():
    """A BASTION'S BATTER (M3): the Burned Land's view stands the city on its mound,
    and the drums stand out past the curtain down the mound's slope -- their outer
    rim 2.5 m and more under the ground at their inner face (MEASURED, the
    Burned Land's ground), past the drum's 2 m footing. So there each drum stands
    on a battered plinth of rusticated stone, a sixteen-sided frustum under its
    socle: its top on the drum's ground (y 0) a hand proud of the socle's face,
    flaring a metre out at its foot 7 m down -- the curtain's batter's line
    (curtain_batter), so the pale socle shows the same 0.7 m over both (the M3
    review: from under the socle's face the drum's showed 1.4 m of it). The
    Capital's field is level and never needs it."""
    top, bot = 0.0, -7.0
    pt, pb = ring_pts(B_RO + .4), ring_pts(B_RO + 1.4)
    vs = [(x, top, z) for x, z in pt] + [(x, bot, z) for x, z in pb]
    n = B_N
    fs = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(k, n + k, n + (k + 1) % n, (k + 1) % n) for k in range(n)]
    mesh('batter', vs, fs, 'Rustic', solid=True)


def curtain_batter():
    """A CURTAIN'S BATTER (M3 review): the Burned Land's view stands each run of
    the curtain on its own ground (capital_view.ts: no higher than the mound at its
    inner face, its footing under the lowest ground outside), so where the mound
    falls away outside the wall the 2 m footing stood up to 1.9 m clear of the ash
    -- and the socle's pale Trim runs down the footing (buried on the Capital's
    level field), so it read as a plain kerb under the rustication. There the run
    stands on a battered plinth of rusticated stone, as the drums do
    (bastion_batter): its top on the run's ground (y 0) a hand proud of the
    socle's face, flaring a metre out at its foot 7 m down. One 8 m bay in
    curtain_bay's frame (x along the wall, +z outward), scaled along x with it."""
    hl = W_BAY / 2
    zi, zt, zb = W_OUT - 1.0, W_OUT + .4, W_OUT + 1.4
    top, bot = 0.0, -7.0
    vs = [(-hl, top, zi), (hl, top, zi), (hl, top, zt), (-hl, top, zt),
          (-hl, bot, zi), (hl, bot, zi), (hl, bot, zb), (-hl, bot, zb)]
    fs = [(0, 1, 2, 3), (7, 6, 5, 4), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2), (0, 4, 5, 1)]
    mesh('batter', vs, fs, 'Rustic', solid=True)


def gate_grille():
    """THE GATE'S GRILLE (M3, decisions 12): the empty city as the Burned Land sees
    it -- the triumphal arch's passage shut by a wrought-iron railing, so the ash sees
    through it up the avenue to the palace dome and the crown, and nobody walks
    into a city that is not there (the Burned Land's view of the Capital is a
    silhouette at its own scale; Warden Morrow takes parties in, and the
    bl_capital portal stands in the arch's mouth outside the grille). In
    gate_arch's frame, on the survey line (z = 0): 2.4 m inside it the arch's
    city face, 8.6 m outside it the Burned Land's. Bars between the passage walls
    up to the arch's springing, three rails and a stile pair where the two leaves
    meet, a lunette of rays under the vault from a gilt sunburst, a gilt boss on
    the meeting stiles. Wrought iron, near black against the limestone (the fabric
    sheet's slate swatch, so it is the facade draw), and gilt; one LOD -- past 140 m the bars are under a pixel."""
    P = G_PASS - .06                          # against the passage walls
    b, r = .025, .06                          # a bar's and a rail's half thickness
    # the frame: the stiles up the passage walls, the rails across, the meeting stiles
    for s in (-1, 1):
        x0, x1 = sorted((s * P, s * G_PASS))
        box('stile', x0, x1, 0, G_SPRING, -r, r, 'Slate')
    for y0, y1 in ((0, .16), (1.0, 1.1), (5.0, 5.1), (G_SPRING - .1, G_SPRING + .02)):
        box('rail', -P, P, y0, y1, -r, r, 'Slate')
    box('meeting stiles', -.1, .1, 0, G_SPRING, -r, r, 'Slate')
    # the bars, a hand apart (0.19 m), the rails' height between them
    n = int(round(2 * P / .19)); step = 2 * P / n
    for i in range(1, n):
        x = -P + step * i
        if abs(x) < .16: continue
        box('bar', x - b, x + b, .16, G_SPRING - .1, -b, b, 'Slate')
    # the lunette: the arch rail under the vault, rays from the sunburst
    sweep('arch rail', [(-r, -.06), (r, -.06), (r, .06), (-r, .06)], arc_frames(0, G_SPRING, G_PASS - .07, 0, math.pi, 8 if lod() else 16), 'Slate')
    for k in range(1, 12):
        a = math.pi * k / 12; c, s_ = math.cos(a), math.sin(a)
        r0, r1 = .55, G_PASS - .1
        prism('ray', [(c * r0 + s_ * b, G_SPRING + s_ * r0 - c * b), (c * r1 + s_ * b, G_SPRING + s_ * r1 - c * b),
                      (c * r1 - s_ * b, G_SPRING + s_ * r1 + c * b), (c * r0 - s_ * b, G_SPRING + s_ * r0 + c * b)], -b, b, 'Slate')
    # the gilt: the sunburst the rays spring from, the boss where the leaves meet
    sun = [(.6 * math.cos(math.pi * k / 10), G_SPRING + .02 + .6 * math.sin(math.pi * k / 10)) for k in range(11)]
    prism('sunburst', sun, -.08, .08, 'Gilt')
    boss = [(.42 * math.cos(2 * math.pi * k / 12), 3.0 + .42 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
    prism('boss', boss, -.1, .1, 'Gilt')


def gate_grille_far():
    """THE GRILLE FROM AFAR (M3 review): gate_grille has one LOD and stops at 140 m,
    where its bars are under a pixel -- and past it the passage read as open from
    the far south road, the shut city as an open gate. This is its far stand-in:
    the grille's outline (the passage's breadth to the springing, the lunette
    under the vault) as one panel of its wrought iron, both faces a hair either
    side of the survey line. Same frame as gate_grille."""
    P = G_PASS - .06
    n = 12
    arc = [(P * math.cos(math.pi * k / n), G_SPRING + P * math.sin(math.pi * k / n)) for k in range(n + 1)]
    outline = [(-P, 0), (P, 0)] + arc
    for z, f in ((.01, 1), (-.01, -1)):
        quad('panel', [(x, y, z) for x, y in outline], 'Slate', (0, 0, f))


def terrace_wall(L=T_BAY):
    """THE PALACE TERRACE'S RETAINING WALL, one 4 m bay: a sheer ashlar face the
    full five metres from the city floor to the terrace -- a rusticated socle, a
    pilaster at the -x joint, a cornice, the top laid as the terrace's edge walk
    -- deep enough (T_D) to hold the field's one-cell rise inside it. The `bal`
    balustrade stands on its top. Origin at the face on the floor, +z toward the
    city (south), the terrace toward -z."""
    hl = L / 2
    if lod():
        box('face', -hl, hl, W_FOOT, T_H, -T_D, 0, 'Ashlar')
        box('cornice', -hl, hl, T_H - .5, T_H - .05, 0, .35, 'Trim')
        return
    box('rustic', -hl, hl, W_FOOT, 1.2, -T_D, 0, 'Rustic')
    box('face', -hl, hl, 1.2, T_H - .55, -T_D, 0, 'Ashlar')
    box('top', -hl, hl, T_H - .55, T_H, -T_D, -.02, 'Trim')
    sweep('socle', [(0, W_FOOT), (.25, W_FOOT), (.25, .3), (.12, .5), (0, .5)], run_x(-hl, hl, 0, 0), 'Trim')
    sweep('band', [(0, 0), (.1, 0), (.14, .06), (.14, .18), (0, .22)], run_x(-hl, hl, 1.2, 0), 'Trim')
    box('pilaster', -hl, -hl + .7, 1.42, T_H - .55, 0, .14, 'Ashlar', bevel=.015)
    sweep('cornice', [(0, 0), (.06, 0)] + cyma(.06, 0, .3, .26, 3) + [(.34, .3), (.36, .44), (.32, .5), (0, .55)], run_x(-hl, hl, T_H - .55, 0), 'Trim')


def stair_cheek():
    """THE GREAT STAIR'S CHEEK WALLS, one either side (symmetric about its own
    middle, so the same module stands at both): ashlar from the floor to a low
    coping over the stair's nosing line -- the lower flight, the landing, the upper
    flight up to the terrace wall's top -- carrying a raking balustrade whose rail
    runs a metre over the nosing (L4), and a newel pedestal at the foot. They close
    the flights' and the landing's sides in the city's stone. Origin on the floor at the stair's top edge (z1), x across the
    cheek, z along the stair (the foot toward -z)."""
    GS = LAYOUT['greatStair']; FL = LAYOUT['terrain']['floor']; TY = LAYOUT['terrain']['terrace']['y']
    run = lambda n: 1.08 + (n - 1) * 2.08 + 1.0             # C5's flight runs (great_stair keeps them)
    upper = 2; lower = (TY - FL) - upper
    z0 = GS['z0'] - GS['z1']; zlt = z0 + run(lower); zuf = -run(upper)
    land = TY - upper - FL
    t = .6
    # L4: a RAKING BALUSTRADE on a low cheek, as the terrace's own and the roofs'
    # (the stair had a solid metre of ashlar each side, a ramp between two walls).
    # `top` is the handrail's top, the line the colliders follow (capital_walls.ts:
    # a metre over the nosing line, the terrace balustrade's 0.8 at its head); the
    # wall stops RAIL under it, its coping carrying the balusters
    RAIL = .8
    top = [(z0, 1.0), (zlt, land + 1.0), (zuf, land + 1.0), (0, T_H + .8)]
    wall = [(z, y - RAIL) for z, y in top]
    poly = [(z0 - .5, W_FOOT), (0, W_FOOT)] + wall[::-1] + [(z0 - .5, wall[0][1])]
    prism('cheek', [(z, y) for z, y in poly], -t, t, 'Ashlar', axis='x')
    def along(line):
        P = [Vector((0, y, z)) for z, y in line]
        nrm = []
        for i in range(len(P) - 1):
            d = (P[i + 1] - P[i]).normalized(); nrm.append(Vector((0, d.z, -d.y)))
        return [(p, Vector((0, 0, 0)) + nv, Vector((1, 0, 0))) for p, nv in zip(P, path_frames_n(nrm))]
    sweep('cheek coping', [(-.0, -t - .08), (.12, -t - .08), (.2, -t), (.2, t), (.12, t + .08), (0, t + .08)], along(wall), 'Trim')
    sweep('handrail', [(-.14, -.2), (-.02, -.2), (0, -.16), (0, .16), (-.02, .2), (-.14, .2)], along(top), 'Trim')
    # the balusters, upright on the coping between it and the rail, ~0.34 m apart
    # a run, none where a pedestal stands at the run's knees
    BAL = [(.06, 0, True), (.075, .16, False), (.034, .32, True), (.05, .38, True), (.05, .44, True), (0, .44, True)]
    for (za, ya), (zb, yb) in zip(wall, wall[1:]):
        n = max(1, int((zb - za - .6) / .34))
        for i in range(n):
            z = za + .3 + (zb - za - .6) * (i + .5) / n
            yb0 = ya + (yb - ya) * (z - za) / (zb - za) + .2
            h = RAIL - .2 - .14
            lathe('baluster', [(r, yb0 + yy * h / .44, hd) for r, yy, hd in BAL], 'Trim', seg=6, cz=z)
    # pedestals at the knees (the landing's two ends) and at the head, where the
    # terrace balustrade's own pedestal stands beyond the cheek
    for z, y in ((zlt, land + 1.0), (zuf, land + 1.0), (-.35, T_H + .8)):
        box('pedestal', -.28, .28, y - RAIL, y + .06, z - .28, z + .28, 'Trim', bevel=.015)
    box('newel', -t - .15, t + .15, W_FOOT, 1.6, z0 - 1.1, z0 + .1, 'Ashlar', bevel=.02)
    box('newel cap', -t - .25, t + .25, 1.6, 1.85, z0 - 1.2, z0 + .2, 'Trim', bevel=.015)


def path_frames_n(nrm):
    """Per-vertex mitred normals for an open polyline's per-segment normals."""
    out = [nrm[0]]
    for i in range(1, len(nrm)): out.append((nrm[i - 1] + nrm[i]) / (1 + nrm[i - 1].dot(nrm[i])))
    out.append(nrm[-1])
    return out


# ======================================================================== THE GARDENS AND SCREENS (M1)
# The ground the houses never reached (decisions 14: the empty lawns filled with
# non-house fabric -- gardens, tree avenues, colonnaded walks, statues, small
# pavilions -- never more houses) in the Colonnade's own language: the arcade
# half-column's TUSCAN order in the round, the house entablature and balustrade
# over it, verdigris where authority sits (the pavilions' domes, the statues),
# gilt only on a dome's finial. Every piece stands on the ground at its origin,
# +z its front.
COLH = H_ARC          # a colonnade's columns stand to the arcade's band: one datum down every street


def tuscan_column(cx, cz, H, r, surf='Trim', M=None):
    """A freestanding Tuscan column, H to the abacus's top: square plinth, torus
    base, a shaft with the arcade half-column's entasis, necking, echinus and a
    square abacus (tuscan_quarter in the round)."""
    p = .5 * r; b = p + .45 * r; st = H - 1.15 * r
    seg = 8 if lod() else 14
    box('col plinth', cx - 1.3 * r, cx + 1.3 * r, 0, p, cz - 1.3 * r, cz + 1.3 * r, surf, bevel=.015, M=M)
    if lod():
        # LOD1: the plinth, a plain six-sided shaft and the abacus -- the silhouette
        lathe('col', [(1.05 * r, p, True), (.9 * r, H - .4 * r, True), (0, H - .4 * r, True)], surf, seg=6, cx=cx, cz=cz, M=M, caps=False)
        box('col abacus', cx - 1.4 * r, cx + 1.4 * r, H - .4 * r, H, cz - 1.4 * r, cz + 1.4 * r, surf, M=M)
        return
    prof = [(1.2 * r, p, True), (1.22 * r, p + .2 * r, False), (1.05 * r, b, True)]
    for i in range(1, 5):
        t = i / 4; prof.append((r * (1 - .12 * max(0, (t - .33) / .67) ** 1.5), b + (st - b) * t, False))
    prof += [(.95 * r, st + .04, True), (1.02 * r, st + .08, True), (1.02 * r, st + .18 * r + .08, True), (.92 * r, st + .3 * r + .08, True)]
    prof += [(r * (.92 + .4 * math.sin(math.pi / 2 * t)), st + .3 * r + .08 + .4 * r * t, False) for t in (.5, 1.0)]
    ab = st + .7 * r + .08
    prof += [(0, ab, True)]
    lathe('col', prof, surf, seg=seg, cx=cx, cz=cz, M=M)
    box('col abacus', cx - 1.4 * r, cx + 1.4 * r, ab, H, cz - 1.4 * r, cz + 1.4 * r, surf, bevel=.015, M=M)


def colonnade():
    """A freestanding COLONNADE SCREEN, one 4 m bay: a Tuscan column on the bay's -x
    joint (the arcade bays' convention: a run closes its +x end with colonnade_end),
    the house entablature over it on both faces, the balustrade on top with its
    pedestal at the joint -- 6.3 m to the coping, the arcade's band, cornice and
    rail carried through the gardens, the gate court's hemicycles and the curtain's
    walks. Origin at the bay's middle on the ground, the screen's line on z 0."""
    tuscan_column(-HW, 0, COLH, .3)
    with at(y=COLH):
        entab()
        with at(M=Matrix.Rotation(math.pi, 4, 'Y')): entab()
    with at(y=COLH + H_ENT): balustrade()


def colonnade_end():
    """The +x end of a colonnade run: its last column, the entablature's return over
    it both ways, the pedestal over that."""
    tuscan_column(0, 0, COLH, .3)
    with at(y=COLH):
        box('end block', -.42, .42, 0, H_ENT, -.42, .42, 'Trim', bevel=.015)
        sweep('end cornice', [(0, 0), (.06, 0)] + cyma(.06, 0, .3, .2, 3) + [(.34, .26), (0, .26)],
              path_frames([Vector((-.42, H_ENT - .26, -.42)), Vector((.42, H_ENT - .26, -.42)), Vector((.42, H_ENT - .26, .42)), Vector((-.42, H_ENT - .26, .42))],
                          [Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))], closed=True), 'Trim', closed=True)
    with at(y=COLH + H_ENT): pedestal(0)


def pavilion():
    """A GARDEN PAVILION: a round temple of eight Tuscan columns on three steps, a
    ring entablature, and a ribbed verdigris dome with a small open lantern and a
    gilt finial -- the civic dome in miniature, set where a garden's walks meet or
    close a vista (the palace gardens, the wards' gardens). Origin at its centre on
    the ground; 7.9 m to the finial's tip."""
    R = 3.9
    lathe('steps', [(R, 0, True), (R, .18, True), (R - .35, .18, True), (R - .35, .36, True), (R - .7, .36, True), (R - .7, .54, True), (0, .54, True)], 'Trim', seg=32 if not lod() else 16)
    Rc = 2.5; Hc = 3.6; y0 = .54
    for k in range(8):
        a = 2 * math.pi * (k + .5) / 8
        with at(y=y0): tuscan_column(math.cos(a) * Rc, math.sin(a) * Rc, Hc, .25)
    ye = y0 + Hc
    ent = [(Rc + .45, ye, True), (Rc + .45, ye + .45, True), (Rc + .5, ye + .48, True), (Rc + .5, ye + .58, True), (Rc + .75, ye + .78, False),
           (Rc + .78, ye + .9, True), (Rc - .1, ye + .9, True)]
    lathe('ring entablature', ent, 'Trim', seg=32 if not lod() else 16, caps=False)
    lathe('ring soffit', [(Rc + .45, ye, True), (0, ye, True)], 'Plaster', seg=32 if not lod() else 16, caps=False)
    d0 = ye + .9; Rd = Rc - .1; Hd = Rd * .95; N = 6 if lod() else 12
    prof = [(Rd * math.cos(math.pi / 2 * i / N), d0 + Hd * math.sin(math.pi / 2 * i / N), i == 0) for i in range(N)]
    rl = .55
    prof = [q for q in prof if q[0] > rl] + [(rl, d0 + Hd * math.sqrt(max(0, 1 - (rl / Rd) ** 2)), True)]
    lathe('dome', prof, 'Copper', seg=32 if not lod() else 16, caps=False, urep=16)
    yl = prof[-1][1]
    for k in range(8 if not lod() else 4):
        a = 2 * math.pi * k / (8 if not lod() else 4)
        rad = Vector((math.cos(a), 0, math.sin(a))); tan = Vector((-math.sin(a), 0, math.cos(a)))
        fr = []
        for i in range(7 if not lod() else 4):
            el = math.asin(min(1, (yl - d0) / Hd)) * i / (6 if not lod() else 3)
            fr.append((Vector((0, d0 + Hd * math.sin(el), 0)) + rad * Rd * math.cos(el), tan, Vector((math.cos(el) * rad.x, math.sin(el), math.cos(el) * rad.z))))
        sweep('rib', [(-.07, -.03), (.07, -.03), (0, .09)], fr, 'CopperRib')
    lathe('lantern', [(rl, yl - .05, True), (rl, yl + .5, True), (rl + .1, yl + .55, True), (rl + .1, yl + .62, True), (0, yl + .62, True)], 'Trim', seg=12)
    lathe('lantern cap', [(rl + .05, yl + .62, True), (.05, yl + .95, False), (0, yl + .97, True)], 'Copper', seg=12)
    lathe('finial', [(r * .35, yy * .35, h) for r, yy, h in FINIAL], 'Gilt', seg=8, cy=yl + .93)


def statue():
    """A STATUE on its die: a magistrate of the Household in verdigris bronze, robed,
    a census roll held across the chest -- no saint, no orb (the empire does
    appointments, not religion: LORE.md) -- on a moulded limestone die. Stands at
    the gardens' walk crossings and before the colonnades. Origin at the die's
    foot; 4.0 m to the head's crown."""
    box('die foot', -.75, .75, 0, .25, -.75, .75, 'Trim', bevel=.02)
    box('die', -.6, .6, .25, 1.5, -.6, .6, 'Ashlar')
    box('die cap', -.72, .72, 1.5, 1.68, -.72, .72, 'Trim', bevel=.02)
    box('plinth', -.45, .45, 1.68, 1.78, -.4, .4, 'Copper')
    y0 = 1.78
    robe = [(.34, 0, True), (.36, .06, False), (.31, .5, False), (.26, .95, False), (.24, 1.1, False), (.27, 1.38, False), (.31, 1.55, False),
            (.24, 1.68, True), (.08, 1.72, True), (.08, 1.8, False), (0, 1.82, True)]
    lathe('robe', [(r, y + y0, h) for r, y, h in robe], 'Copper', seg=10 if not lod() else 6)
    lathe('head', [(0, 0, True)] + [(.12 * math.sin(math.pi * i / 6), .28 * (1 - math.cos(math.pi * i / 6)) / 2, False) for i in range(1, 6)] + [(0, .28, True)],
          'Copper', seg=10 if not lod() else 6, cy=y0 + 1.78)
    # the toga's fold down the front and over the left shoulder
    prism('fold', [(-.28, .2), (-.05, .2), (.3, 1.62), (.12, 1.66)], .18, .3, 'Copper', axis='z', M=Matrix.Translation(Vector((0, y0, 0))))
    # the forearms across the chest, the roll between the hands
    box('arm', -.3, .22, y0 + 1.18, y0 + 1.3, .14, .3, 'Copper')
    lathe('roll', [(.07, -.28, True), (.07, .28, True), (0, .28, True)], 'Copper', seg=8, M=Matrix.Translation(Vector((0, y0 + 1.33, .26))) @ Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    for s in (-1, 1): box('arm', s * .34 - .07, s * .34 + .07, y0 + 1.15, y0 + 1.6, -.08, .08, 'Copper')


def urn():
    """A garden urn on its pedestal: the acroterion urn (URN) at garden scale on a
    moulded die -- the balustrades' pedestals carried into the parterres. 2.3 m."""
    box('urn die foot', -.36, .36, 0, .16, -.36, .36, 'Trim', bevel=.015)
    box('urn die', -.28, .28, .16, .95, -.28, .28, 'Ashlar')
    box('urn die cap', -.34, .34, .95, 1.05, -.34, .34, 'Trim', bevel=.015)
    lathe('urn', [(r * 1.65, yy * 1.65, h) for r, yy, h in URN], 'Trim', seg=12 if not lod() else 8, cy=1.05)


def basin():
    """A GARDEN BASIN where a parterre's walks cross: a low moulded stone rim round
    still water and a single turned jet-bowl -- the square's fountain without its
    instrument, 2.4 m across the water. Origin at its centre on the ground."""
    R0 = 2.4
    lathe('basin rim', [(R0, 0, True), (R0, .1, True), (R0 + .08, .14, True), (R0 + .08, .38, False), (R0 + .16, .45, True), (R0 + .16, .5, True),
                        (R0 - .2, .5, True), (R0 - .2, .3, True), (0, .3, True)], 'Trim', seg=32 if not lod() else 16)
    lathe('basin water', [(R0 - .2, 0, True), (0, 0, True)], 'Water', seg=32 if not lod() else 16, cy=.4)
    lathe('jet bowl', [(.45, .3, True), (.45, .45, True), (.28, .55, False), (.18, .8, True), (.6, .95, False), (.7, 1.02, True), (.7, 1.08, True), (0, 1.08, True)],
          'Trim', seg=16 if not lod() else 8)


# ======================================================================== BUILD
# Budgets are the design targets the test holds each file to (triangles). LOD1 of a
# bay must also be <= 25% of its LOD0 (checked in the test from the measured counts).
BAY_BUDGET = {'av': (6500, 1500), 'avp': (5600, 1400), 'wd': (3600, 900), 'yd3': (2600, 700), 'yd2': (2000, 600), 'sd3': (4200, 1100)}
MODS = []   # (name, kind, builder, budget, lod_of, ao_dist, extra)


def add(name, kind, fn, budget, lod_of=None, lod_level=0, ao_dist=.6, extra=None):
    MODS.append((name, kind, fn, budget, lod_of, lod_level, ao_dist, extra or {}))


BAY_BACKS = {'av': ('door', 'shop', 'blind', 'passage'), 'avp': ('door', 'shop', 'blind'), 'wd': ('win', 'door', 'passage'),
             'yd3': ('win', 'door', 'passage'), 'yd2': ('win', 'door', 'passage'), 'sd3': ('win', 'passage')}
def bay_name(rank, back, ped, state):
    return f'bay_{rank}_{back}' + (f'_{ped}' if rank == 'av' and back != 'passage' else '') + f'_{state}'
def bay_peds(rank, back): return ('tri', 'seg') if rank == 'av' and back != 'passage' else ('tri',)


def bay_lods(rank, state, base):
    """The files a bay draws at LOD0, LOD1 and LOD2 -- capital_blocks.ts bayFiles,
    which capital_layout.test.mjs holds this to through manifest `modules`. Past
    45 m a door is drawn as the blind niche (the same arch with nothing standing
    out of it) and a ward bay but a passage as the ward window; a courtyard face,
    which no street sees, goes straight from LOD0 to its painted card. A LOD1
    nothing draws is not built (2026-10-05: twenty of them shipped unused)."""
    card = f'lod2_{rank}_{state}'
    if rank in ('yd3', 'yd2'): return [base, card, card]
    far = base
    if rank in ('av', 'avp'): far = base.replace('_door_', '_blind_')
    elif rank == 'wd' and '_passage_' not in base: far = f'bay_wd_win_{state}'
    return [base, f'{far}_lod1', card]


BAY_LODS = {b: bay_lods(rank, state, b) for rank in RANKS for state in ('e', 'r') for back in BAY_BACKS[rank]
            for b in (bay_name(rank, back, ped, state) for ped in bay_peds(rank, back))}
DRAWN_LOD1 = {lods[1] for lods in BAY_LODS.values()}
for rank in RANKS:
    backs = BAY_BACKS[rank]
    for state in ('e', 'r'):
        for back in backs:
            peds = bay_peds(rank, back)
            for ped in peds:
                base = bay_name(rank, back, ped, state)
                b0, b1 = BAY_BUDGET[rank]
                ex = {'rank': rank, 'back': back, 'ped': ped, 'state': state, 'height': round(RANKS[rank][0], 3), 'lod2': f'lod2_{rank}_{state}'}
                # sd3's passage is the END ARCH of an arcade walk (K2): a corner
                # house's side bay over the walk, opening it onto the side street
                # -- the arch through the 0.6 m slab only, no tunnel behind it
                if back == 'passage': ex['passage'] = {'clearWidth': 2 * PASS[0], 'springing': PASS[1], 'crown': PASS[0] + PASS[1], 'throughToZ': -.6 if rank == 'sd3' else -WARD_D if rank == 'wd' else -PLOT}
                add(base, 'bay', (lambda r, b, p, s: lambda: bay(r, b, p, s))(rank, back, ped, state), b0, extra=ex)
                if base + '_lod1' in DRAWN_LOD1:
                    add(base + '_lod1', 'bay', (lambda r, b, p, s: lambda: bay(r, b, p, s))(rank, back, ped, state), b1, lod_of=base, lod_level=1)
        add(f'lod2_{rank}_{state}', 'lod2', (lambda r, s: lambda: lod2(r, s))(rank, state), 4, extra={'rank': rank, 'state': state, 'height': round(RANKS[rank][0], 3)})

for rank in ('av', 'yd3', 'wd', 'yd2'):
    add(f'cnr_{rank}', 'corner', (lambda r: lambda: corner_column(r))(rank), 900)
add('pc_return', 'corner', pc_return, 400)
add('walk_return', 'corner', walk_return, 200)
add('bal_end', 'corner', lambda: pedestal(0), 120)
add('roof_run', 'roof', roof_run, 200)
add('roof_end', 'roof', roof_end, 260)
add('chimney', 'roof', chimney, 260)
add('pc_pediment', 'roof', pc_pediment, 900)
# M1: a civic range's pediment, its gable roofed in copper as the range is (ruling 4)
add('pc_pediment_cu', 'roof', lambda: pc_pediment(roof='Copper'), 900)
add('roof_deck', 'roof', roof_deck, 12)
add('belvedere', 'roof', belvedere, 1600)
add('column', 'civic', civic_column, 7000, ao_dist=.5)
add('column_lod1', 'civic', civic_column, 1200, lod_of='column', lod_level=1, ao_dist=.5)
add('cent', 'civic', lambda: civic_entab(), 900)
add('cent_cnr', 'civic', lambda: corner_piece(CENT(), 0), 200)
add('cent_front', 'civic', lambda: civic_entab(23.2, True, 'Inscr'), 4500)
add('hall_ped', 'civic', lambda: hall_pediment(), 1800)
add('cella_bay', 'civic', lambda: cella_bay(), 1400)
add('cella_door', 'civic', lambda: cella_bay(10.0, 6.0, True), 1400)
add('hall_podium', 'civic', lambda: podium(23.2, 27.0), 1800)
add('hall_dome', 'civic', lambda: dome_kit(8.0, 5.4, 12, 16), 26000, ao_dist=.8)
add('hall_dome_lod1', 'civic', lambda: dome_kit(8.0, 5.4, 12, 16), 6500, lod_of='hall_dome', lod_level=1, ao_dist=.8)
add('coffers', 'civic', coffers, 300)
add('brazier', 'civic', brazier, 900)
add('brazier_cold', 'civic', lambda: brazier(False), 900)
add('fountain', 'civic', fountain, 8000)
add('banner', 'dressing', banner, 120)
for court, surf in (('caerdun', 'BannerCaer'), ('heartwood', 'BannerHeart'), ('moonmere', 'BannerMoon')):
    add(f'banner_{court}', 'dressing', (lambda sf: lambda: banner(sf))(surf), 120, extra={'state': 'r', 'court': court})
add('lamp', 'street', lamp, 1400)
# The tree a planter carries is not in its GLB, so its cost is recorded here for the
# K2 district measurement. MEASURED 2026-10-04 in /?zone=huntingwood:
# trees.ts buildGeneratedTree(file) -> getTotalIndices() / 3 of the template and of
# its __treeLod double; each is one mesh of two submeshes (bark, canopy). Trees are
# thin-instanced per template and split near/far at LOD_NEAR = 70 m, so the draws
# do not grow with the planter count: at most 5 variants x 2 LODs x 2 submeshes.
TREE_COST = {'trisNear': {'CommonTree_1': 944, 'CommonTree_2': 988, 'CommonTree_3': 912, 'CommonTree_4': 882, 'CommonTree_5': 1334},
             'trisFar': {'CommonTree_1': 248, 'CommonTree_2': 260, 'CommonTree_3': 252, 'CommonTree_4': 242, 'CommonTree_5': 320},
             'nearWithin': 70, 'drawsPerTemplatePerLod': 2, 'drawsCityMax': 20, 'measured': '2026-10-04, trees.ts in /?zone=huntingwood'}
add('planter', 'street', planter, 200, extra={'tree': {'files': [f'nature/CommonTree_{i}.gltf' for i in range(1, 6)], 'scale': .62, 'y': .8,
                                                       'note': 'plant one of the five at random yaw; trees.ts gives each its own LOD and wind',
                                                       'cost': TREE_COST}})
add('bench', 'street', bench, 200)
add('feast_table', 'dressing', feast_table, 3200, extra={'footprint': [2.8, 2.1], 'places': 8})
add('market', 'dressing', market, 700)
add('stall', 'dressing', stall, 1500, extra={'footprint': [3.0, 1.9]})
add('well', 'dressing', well, 900)
# L2: the streets' kerbs and the courtyard gardens
add('kerb', 'street', kerb, 80, extra={'length': 4.0, 'width': .3, 'height': .15})
add('hedge', 'dressing', hedge, 300, extra={'footprint': [4.0, .7]})
add('parterre', 'dressing', parterre, 900, extra={'footprint': [4.0, 2.4]})
add('washline', 'dressing', washline, 200, extra={'footprint': [3.5, .2], 'state': 'r'})
# K3: the Hall entered and its roof terrace railed
add('cella_door_open', 'civic', lambda: cella_bay(10.0, 6.0, True, False), 1400)
add('bal', 'civic', lambda: balustrade(), 1800)
add('bal_lod1', 'civic', lambda: balustrade(), 300, lod_of='bal', lod_level=1)
add('hall_stack', 'civic', hall_stack, 800)
add('hall_table', 'civic', hall_table, 1000)
add('hall_floor', 'civic', hall_floor, 120)
add('hall_portico_floor', 'civic', lambda: hall_floor(23.2, 7.0), 120)
add('hall_panel', 'civic', hall_panel, 12)
add('hall_room_far', 'civic', hall_room_far, 120)
# L1: the walls. Kind 'wall': LOD0 near, LOD1 for everything beyond (no card --
# a wall is already a few dozen triangles at LOD1); the bastion's inside is near only
add('curtain', 'wall', curtain_bay, 1400, extra={'length': W_BAY})
add('curtain_lod1', 'wall', curtain_bay, 240, lod_of='curtain', lod_level=1)
add('curtain_cap', 'wall', curtain_cap, 700)
add('bastion', 'wall', lambda: bastion(0), 6000, ao_dist=1.0)
add('bastion_lod1', 'wall', lambda: bastion(1), 1500, lod_of='bastion', lod_level=1, ao_dist=1.0)
add('bastion_in', 'wall', bastion_in, 1200, ao_dist=1.0)
add('gate_arch', 'wall', gate_arch, 9000, ao_dist=1.0)
add('gate_arch_lod1', 'wall', gate_arch, 2250, lod_of='gate_arch', lod_level=1, ao_dist=1.0)
add('gate_grille', 'wall', gate_grille, 1400)
add('bastion_batter', 'wall', bastion_batter, 260, ao_dist=1.0)
add('curtain_batter', 'wall', curtain_batter, 60, ao_dist=1.0)
add('gate_grille_far', 'wall', gate_grille_far, 60)
add('terrace_wall', 'wall', terrace_wall, 260, extra={'length': T_BAY})
add('terrace_wall_lod1', 'wall', terrace_wall, 60, lod_of='terrace_wall', lod_level=1)
add('stair_cheek', 'wall', stair_cheek, 4000)
# L3: the named buildings -- the Archive and its tower, the Chapel's rotunda, dome
# and lamps, the parts their shells merge -- and the tenants' signs and the bakery board
add('archive_podium', 'civic', lambda: podium(SF_W, 27.0, flags=True), 1800)
add('chapel_podium', 'civic', lambda: podium(24.0, 33.0, flags=True), 2000)
add('front_cent', 'civic', lambda: civic_entab(SF_W, True), 2000)
add('archive_ped', 'civic', lambda: hall_pediment(SF_W, 15, 'TympHall', urn=True), 1800)
add('chapel_ped', 'civic', lambda: hall_pediment(SF_W, 15, 'TympHouse', urn=True), 1800)
add('archive_floor', 'civic', lambda: hall_floor(12.2, 17.6), 120)
add('archive_room_far', 'civic', lambda: hall_room_far(13.4, 18.8, 10.05, 3), 120)
add('archive_tower', 'civic', archive_tower, 14000, ao_dist=1.0, extra={'tower': TOWER})
add('archive_roof', 'civic', archive_roof, 200)
add('archive_tower_lod1', 'civic', archive_tower, 3000, lod_of='archive_tower', lod_level=1, ao_dist=1.0)
add('chapel_rotunda', 'civic', rotunda, 16500, ao_dist=1.0, extra={'rotunda': {k: (list(v) if isinstance(v, tuple) else v) for k, v in ROT.items()}})
add('chapel_dome', 'civic', lambda: dome_kit(7.2, 4.0, 12, 16, win='Dark', lantern='Dark'), 26000, ao_dist=.8)
add('chapel_dome_lod1', 'civic', lambda: dome_kit(7.2, 4.0, 12, 16, win='Dark', lantern='Dark'), 6500, lod_of='chapel_dome', lod_level=1, ao_dist=.8)
add('chapel_lamp', 'street', chapel_lamp, 700)
# (2026-10-11: the auction house is the Exchange, no longer a tenanted house: its
# bracket sign, sign_auction, retired with the role; _balance stays, the emblem's
# first drawing)
for kind in ('inn', 'bakery', 'armoury'):
    add(f'sign_{kind}', 'dressing', (lambda k: lambda: trade_sign(k))(kind), 1200)
for st in ('e', 'r'):
    add(f'bakery_board_{st}', 'dressing', (lambda s_: lambda: bakery_board(s_))(st), 2400, extra={'state': st})
# L3 review: the Archive's reading desk, the story's desk drawn as a module of its
# own (the room of presses was the one Colonnade interior still dressed with kit props)
for st in ('e', 'r'):
    add(f'archive_desk_{st}', 'civic', (lambda s_: lambda: archive_desk(s_))(st), 1000, extra={'state': st, 'footprint': [2.9, 1.16]})
# the shells last: they call the modules above by name
for st in ('e', 'r'):
    add(f'hall_shell_{st}', 'civic', (lambda s_: lambda: hall_shell(s_))(st), 37000,
        extra={'state': st, 'parts': [[f, round(u, 4), round(y, 4), round(v, 4), round(r, 6), [round(a, 4) for a in ax]] for f, u, y, v, r, ax in hall_shell_parts(st)]})
# (L3's shells: the same merge, from their part lists)
_parts = lambda P: [[f, round(u, 4), round(y, 4), round(v, 4), round(r, 6), [round(x, 4) for x in ax]] for f, u, y, v, r, ax in P]
for st in ('e', 'r'):
    add(f'archive_shell_{st}', 'civic', (lambda s_: lambda: merged(archive_shell_parts(s_)))(st), 31000,
        extra={'state': st, 'parts': _parts(archive_shell_parts(st))})
add('chapel_shell', 'civic', lambda: merged(chapel_shell_parts()), 40000, extra={'parts': _parts(chapel_shell_parts())})
# 2026-10-11: THE EXCHANGE -- its shell's own parts (the podium, the fabric: the
# court's cornice, antae, wall tops, leads and parapets; the two copper hips), the
# tower that switches (with its LOD1), the near-only counter and board per city,
# then the shell merged per city (the braziers cold in the empty city)
add('exch_podium', 'civic', exch_podium, 2000)
add('exch_fabric', 'civic', exch_fabric, 2500)
add('exch_roof_front', 'civic', lambda: hip_roof(6.2, 26.4), 200)
add('exch_roof_back', 'civic', lambda: hip_roof(6.6, 26.4), 200)
add('exch_tower', 'civic', exch_tower, 14000, ao_dist=1.0, extra={'tower': {k: (list(v) if isinstance(v, tuple) else v) for k, v in EX_TOWER.items()}})
add('exch_tower_lod1', 'civic', exch_tower, 3200, lod_of='exch_tower', lod_level=1, ao_dist=1.0)
add('exch_counter', 'civic', exch_counter, 700, extra={'footprint': [2.6, .7]})
for st in ('e', 'r'):
    add(f'exch_board_{st}', 'civic', (lambda s_: lambda: exch_board(s_))(st), 400, extra={'state': st})
for st in ('e', 'r'):
    add(f'exch_shell_{st}', 'civic', (lambda s_: lambda: merged(exch_shell_parts(s_)))(st), 51000,
        extra={'state': st, 'parts': _parts(exch_shell_parts(st))})
# L4: THE PALACE -- its parts first (the giant-order bays, the corner, the portico's
# entablature and pediment, the podium, the vestibule, the roofs), the dome and the
# crown that stay instanced, the Great Stair, then the shells merged from the parts
# (central block per city, the wing the same in both), each with a LOD1 for beyond
# 45 m: the bays' mouldings and balusters go, the silhouette stays.
def palace_dome():
    D = PAL['dome']
    ft = dome_kit(D['r'], D['drum'], 12, 16, crown=True)
    assert abs(ft - D['lanternTop']) < 1e-3, f"palace lantern top {ft:.4f}, the plan says {D['lanternTop']}"


PP = PAL['podium']
add('palace_bay', 'civic', lambda: palace_bay('win'), 2100)
add('palace_bay_plain', 'civic', lambda: palace_bay('win', balc=False), 1400)
add('palace_bay_door', 'civic', lambda: palace_bay('door'), 2100)
add('palace_corner', 'civic', palace_corner, 300)
add('palace_cent_front', 'civic', lambda: civic_entab(2 * PAL['portico']['half'], True), 5200)
add('palace_ped', 'civic', lambda: hall_pediment(2 * PAL['portico']['half'], palace=True), 3200)
add('palace_podium', 'civic', lambda: podium(2 * PP['half'], PP['depth'], PP['h'], PP['steps'], flags=True), 2400)
add('palace_vestibule', 'civic', palace_vestibule, 1400)
add('palace_roof', 'civic', lambda: palace_roof(2 * PP['half'], PP['depth'] + PAL['face']), 200)
add('palace_wing_roof', 'civic', lambda: hip_roof(PAL['wings']['u'][1] - PAL['wings']['u'][0], PAL['wings']['v'][1] - PAL['wings']['v'][0]), 200)
add('palace_dome', 'civic', palace_dome, 30000, ao_dist=1.2, extra={'lanternTop': PAL['dome']['lanternTop']})
add('palace_dome_lod1', 'civic', palace_dome, 7500, lod_of='palace_dome', lod_level=1, ao_dist=1.2)
add('palace_crown', 'civic', palace_crown, 6000, ao_dist=.4)
add('great_stair', 'civic', great_stair, 3000)
for st in ('e', 'r'):
    add(f'palace_shell_{st}', 'civic', (lambda s_: lambda: merged(palace_shell_parts(s_)))(st), 115000, ao_dist=1.0,
        extra={'state': st, 'parts': _parts(palace_shell_parts(st))})
    add(f'palace_shell_{st}_lod1', 'civic', (lambda s_: lambda: merged(palace_shell_parts(s_)))(st), 27500, lod_of=f'palace_shell_{st}', lod_level=1, ao_dist=1.0)
add('palace_wing', 'civic', lambda: merged(palace_wing_parts()), 80000, ao_dist=1.0, extra={'parts': _parts(palace_wing_parts())})
add('palace_wing_lod1', 'civic', lambda: merged(palace_wing_parts()), 20000, lod_of='palace_wing', lod_level=1, ao_dist=1.0)
# L5: the two cities city-wide -- the avenue's lamp banners (the Household's; the
# courts' in the returned city), the ward streets' bracket lanterns, the square's
# covered stalls, the child's game per city, the back lanes' morning washing
add('banner_pole', 'dressing', banner_pole, 160, extra={'mount': 'lamp', 'state': 'e'})
for court, surf in (('caerdun', 'BannerCaer'), ('heartwood', 'BannerHeart'), ('moonmere', 'BannerMoon')):
    add(f'banner_pole_{court}', 'dressing', (lambda sf: lambda: banner_pole(sf))(surf), 160, extra={'mount': 'lamp', 'state': 'r', 'court': court})
add('lamp_wall', 'street', lamp_wall, 300, extra={'mount': 'bay joint'})
add('stall_covered', 'dressing', stall_covered, 500, extra={'footprint': [3.0, 1.9], 'state': 'e'})
for st in ('e', 'r'):
    add(f'childs_game_{st}', 'dressing', (lambda s_: lambda: childs_game(s_))(st), 1400, extra={'footprint': [1.44, 1.44], 'state': st})
add('washline_street', 'dressing', washline_street, 300, extra={'span': 7.0, 'state': 'r'})
# M1: the gardens and screens (THE GARDENS AND SCREENS above)
add('colonnade', 'civic', colonnade, 4200, extra={'bay': BAY, 'height': round(COLH + H_ENT + H_BAL, 3)})
add('colonnade_lod1', 'civic', colonnade, 1050, lod_of='colonnade', lod_level=1)
add('colonnade_end', 'civic', colonnade_end, 1000)
add('pavilion', 'civic', pavilion, 9000, ao_dist=.8, extra={'radius': 3.9})
add('pavilion_lod1', 'civic', pavilion, 2250, lod_of='pavilion', lod_level=1, ao_dist=.8)
add('statue', 'dressing', statue, 900, extra={'footprint': [1.5, 1.5]})
add('urn', 'dressing', urn, 500, extra={'footprint': [.72, .72]})
add('basin', 'dressing', basin, 1200, extra={'radius': 2.56})


# THE PARTS THE SHELLS ARE MADE OF, which no zone places on its own: the Hall's,
# the Archive's, the Chapel's and the palace's fronts, podia, pediments, bays and
# far rooms, the Chapel's rotunda and lamps, the banners hung in the porticoes.
# merged() calls their builders directly, so their files are only a record: they
# go to BUILD, not the game's folder, and the manifest keeps them under `parts`
# (budgets, triangles, bounds -- capital_modules.test.mjs sums the shells from
# them). MEASURED 2026-10-05: the runtime never requests one of them in either
# city, day or night, at any LOD, or from the Burned Land; capital_layout.test.mjs
# holds the folder to the zones' plans, so a part a zone starts placing fails there.
MERGE_ONLY = {
    'cent', 'cent_cnr', 'cent_front', 'front_cent', 'palace_cent_front',
    'hall_ped', 'archive_ped', 'chapel_ped', 'palace_ped',
    'hall_podium', 'archive_podium', 'chapel_podium', 'palace_podium',
    'hall_portico_floor', 'hall_room_far', 'archive_room_far', 'archive_roof', 'palace_roof',
    'cella_door', 'chapel_rotunda', 'chapel_lamp',
    'palace_bay', 'palace_bay_plain', 'palace_bay_door', 'palace_corner', 'palace_vestibule',
    'banner', 'banner_caerdun', 'banner_heartwood', 'banner_moonmere',
    'exch_podium', 'exch_fabric', 'exch_roof_front', 'exch_roof_back',
}
_merged = {f for n, kind, fn, budget, lod_of, lvl, aod, extra in MODS for f, *_ in extra.get('parts', ())}
assert MERGE_ONLY <= _merged, f'MERGE_ONLY names no shell merges: {sorted(MERGE_ONLY - _merged)}'
assert not MERGE_ONLY & {n for n, kind, fn, budget, lod_of, *_ in MODS if lod_of}, 'a LOD is never a part'


def run():
    for name, kind, fn, budget, lod_of, lvl, aod, extra in MODS:
        base = lod_of or name
        if ONLY is not None and base not in ONLY and name not in ONLY: continue
        G.LOD = lvl
        G.start(name)
        fn()
        ex = dict(extra)
        if lod_of: ex['lodOf'] = lod_of; ex['lod'] = lvl
        G.save(name, BUILD if name in MERGE_ONLY else OUT, ao_dist=aod, kind=kind, budget=budget, extra=ex)
    G.LOD = 0


run()

# ---------------------------------------------------------------- manifest
man_path = OUT / 'manifest.json'
old = json.loads(man_path.read_text()) if man_path.exists() and ONLY is not None else {}
files = dict(old.get('files', {}))     # what ships, in OUT
parts = dict(old.get('parts', {}))     # MERGE_ONLY: in BUILD, merged into the shells
for n, rec in G.CATALOG.items():
    (parts if n in MERGE_ONLY else files)[n] = rec
    (files if n in MERGE_ONLY else parts).pop(n, None)
modules = {}
for n, rec in files.items():
    if 'lodOf' in rec: continue
    if n in BAY_LODS: lods = list(BAY_LODS[n])   # what the runtime draws (bay_lods)
    else:
        lods = [n]
        for m, r in files.items():
            if r.get('lodOf') == n: lods.append(m)
        lods.sort(key=lambda m: files[m].get('lod', 0))
        if rec.get('lod2'): lods.append(rec['lod2'])
    modules[n] = {'kind': rec['kind'], 'lods': lods}
# What stands above the curtain's walk, mounted where the blocks mount it
# (capital_blocks.ts), measured from the exported GLBs. Decisions 13 settled
# K1's open question by raising the curtain: the walk at 15 m, its parapet's
# coping at 16.2, the houses' facades 12.5, ridges 14.5, pediments 13.5 and
# the belvederes lowered to 15 -- so only the chimney pots (15.7) stand over the
# walk, and nothing over the coping. The test pins these.
MOUNTS = {'roof_run': Y_BAL, 'roof_end': Y_BAL, 'pc_pediment': Y_BAL, 'chimney': Y_BAL + RH - .55, 'belvedere': Y_BAL}
CURTAIN = {'walk': W_WALK, 'parapet': W_PAR, 'roofPitch': RP,
           'source': 'zones/capital_walls.ts CL_WALL.walk = 15 (decisions 13: the curtain raised over the houses); the outer parapet coping at 16.2',
           'tops': {n: {'mount': round(m, 3), 'top': round(m + files[n]['max'][1], 3)} for n, m in MOUNTS.items() if n in files},
           'above': {n: {'mount': round(m, 3), 'top': round(m + files[n]['max'][1], 3)} for n, m in MOUNTS.items()
                     if n in files and m + files[n]['max'][1] > W_WALK}}
WALLS = {'inner': W_IN, 'outer': W_OUT, 'mid': round(W_MID, 3), 'bay': W_BAY, 'foot': W_FOOT, 'rustic': W_RUS, 'cornice': W_COR,
         'walk': W_WALK, 'parapet': W_PAR, 'kerb': W_KERB, 'parapetThick': W_PT,
         'bastion': {'apothemOut': B_RO, 'apothemIn': B_RI, 'sides': B_N, 'cornice': B_CORNICE, 'top': B_TOP, 'parapet': B_PARAPET,
                     'door': list(B_DOOR), 'walkDoor': list(B_WDOOR), 'cityFacet': 8, 'walkFacets': [5, 11], 'stair': B_STAIR},
         'gate': {'half': G_HALF, 'z': list(G_Z), 'passHalf': G_PASS, 'springing': G_SPRING, 'entablature': list(G_ENT), 'attic': list(G_ATTIC), 'top': G_TOP},
         'terrace': {'height': T_H, 'depth': T_D, 'bay': T_BAY}}
manifest = {
    'about': 'The Capital (Colonnade City) module library, generated by tools/assets/build_capital_modules.py -- do not edit by hand.',
    'units': 'metres', 'up': 'Y', 'outward': '+Z',
    'datums': {k: (round(v, 3) if isinstance(v, float) else v) for k, v in {'bay': BAY, 'plot': PLOT, 'walk': WALK, 'arcade': H_ARC, 'nobile': Y_NOB, 'attic': Y_ATT, 'entablature': Y_ENT,
               'balustrade': Y_BAL, 'top': Y_TOP, 'wardDepth': WARD_D, 'wardEntablature': Y_ENT_W, 'wardBalustrade': Y_BAL_W, 'wardTop': Y_TOP_W,
               'roofEave': Y_BAL, 'roofRidge': round(Y_BAL + RH, 3), 'roofDepth': RD, 'roofPitch': RP,
               'pedimentApex': round(Y_BAL + (6.3 + .8) * math.tan(RAD(12)) + .32, 3),
               'arch': {'radius': ARCH[0], 'springing': ARCH[1]}, 'passage': {'clearWidth': 2 * PASS[0], 'springing': PASS[1], 'crown': round(PASS[0] + PASS[1], 3)}}.items()},
    'ranks': {k: {'height': round(v[0], 3), 'about': v[1]} for k, v in RANKS.items()},
    'curtain': CURTAIN,
    'walls': WALLS,
    'limits': {'materials': 8, 'bayMaterials': 3, 'lod2Materials': 1, 'lod1Ratio': .25},
    'lodDistances': {'lod1': 45, 'lod2': 140, 'note': 'metres from camera to the culling cell; per-cell LOD, the cells are CITY-LOADING.md CellIndex cells'},
    # the stone, joinery and glass are drawn as ONE material on the facade sheet
    # (cl_facade.json; capital-architecture.ts toFacade): `facade` is the part of it
    # each is, `color` the painter's ground for that sheet, only for the runtime's
    # fallback should a template's parts ever share vertices
    'materials': {
        'CL_Stone': {'facade': 'stone', 'color': '#cfc09c', 'roughness': .9, 'metallic': 0, 'about': 'the one limestone atlas; its night (the returned city LOD2 windows, the lamp cores) is the facade glow sheets'},
        'CL_Fabric': {'facade': 'fabric', 'color': '#5a3b26', 'roughness': .7, 'metallic': 0},
        'CL_Glass': {'facade': 'glass', 'color': '#173a40', 'roughness': .12, 'metallic': 0, 'about': 'lamplit panes in the returned city facade glow sheet only'},
        'CL_Roof': {'albedo': 'cl_honey.jpg', 'roughness': .85, 'metallic': 0, 'tiling': True},
        'CL_Copper': {'albedo': 'cl_copper.jpg', 'roughness': .5, 'metallic': .25, 'tiling': True},
        'CL_Gilt': {'color': '#d8a442', 'roughness': .32, 'metallic': .9, 'emissive': '#1a1104'},
        'CL_Glow': {'color': '#efe0b8', 'emissiveNight': '#ffcf88', 'roughness': .4, 'metallic': 0},
        'CL_Water': {'color': '#2c5e60', 'roughness': .06, 'metallic': .1},
    },
    'backFaceCulling': 'every material is single-sided (glTF doubleSided false): keep backFaceCulling on; two-sided surfaces carry their own back faces',
    'vertexColor': 'baked ambient occlusion x per-surface tint; set useVertexColors, hasVertexAlpha = false',
    'uv': 'glTF convention (origin top-left): load every sheet with invertY = false',
    'atlas': A.manifest_layout(),
    'modules': modules,
    'files': files,
    'partsAbout': 'the merged shells\' parts (MERGE_ONLY): built into tools/assets/build/capital/, never shipped -- no zone places one on its own',
    'parts': parts,
}
man_path.write_text(json.dumps(manifest, indent=1) + '\n')
# a full build owns the folder's modules: a .glb it did not write is left over from
# an older library (a retired module, a part that used to ship) and goes
if ONLY is None:
    for f in sorted(OUT.glob('*.glb')):
        if f.stem not in files: print('  removed stale', f.name); f.unlink()
print('CAPITAL MODULES', len(modules), 'modules,', len(files), 'files,', sum(v['tris'] for v in files.values()), 'tris total,', len(parts), 'merge-only parts')
