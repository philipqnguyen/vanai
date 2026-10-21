"""Caerdun's Sea Gate module library: every module, LOD, sheet and the manifest
from one command (CITY-BUILD.md "Original modules from a generator").

    blender -b --python tools/assets/build_caerdun_modules.py -- [--no-paint] [--renders] [name ...]

1. paints the sheets (paint_caerdun_textures.py, system python: numpy + PIL);
2. builds every module (caerdun_mod_*.py on caerdun_geom.py, pure python, game
   coordinates) into one Blender object per material, bakes ambient occlusion
   into the ONE colour layer (Cycles, fixed seed), multiplies the per-face tint
   in, and exports GLB: COLOR_0 only (Blender 5.2 would otherwise write a white
   COLOR_0 and push the AO to COLOR_1, which Babylon ignores), single-sided
   materials, no images, untransformed nodes;
3. renders every picture the LODs carry (caerdun_atlas.VIEWS, and the stone
   sheet's l1_arc band) orthographically from the LOD0 modules, by day and by
   night, and composes them into the far sheet, then stacks the facade sheet;
4. writes manifest.json: per file its triangles, materials, bounds and whether its
   AO baked; per module its set, LODs and the catalogue's rules; the contract's
   datums; the LOD distances; the material bindings and the atlas. It records NO
   budgets: the ceilings live in client/test/caerdun_modules.test.mjs.

Naming a module rebuilds only it (and merges into the manifest); add --renders to
re-render the pictures too. Only a full build is the reproducible one.

Deterministic: fixed seeds, UVs snapped to 2^-15 (caerdun_geom), positions rounded
to 0.1 mm, everything sorted. A full build into a scratch copy (CAERDUN_OUT and
CAERDUN_BUILD set) is byte-identical, file for file.

Output: client/public/models/seagate/ -- only what the game loads (88 GLBs, the
manifest, sg_facade.json and the shipped sheets). The part sheets the facade is
stacked from and the renders stay in tools/assets/build/caerdun/ (gitignored).
"""
import bpy, sys, os, json, math, subprocess, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import caerdun_atlas as A
import caerdun_geom as G
import caerdun_mod_walls, caerdun_mod_harbour, caerdun_mod_town, caerdun_mod_civic, caerdun_mod_lod, caerdun_mod_yard, caerdun_mod_dress  # noqa: F401 (they register)
import caerdun_mod_auction  # noqa: F401 (the auction house, 2026-10-11)

ROOT = HERE.parents[1]
OUT = Path(os.environ.get('CAERDUN_OUT', ROOT / 'client/public/models/seagate'))
BUILD = Path(os.environ.get('CAERDUN_BUILD', HERE / 'build/caerdun'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PAINT = '--no-paint' not in argv
ONLY = {a for a in argv if not a.startswith('--')} or None
RENDERS = ONLY is None or '--renders' in argv
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)

# The contract's catalogue (tools/data/caerdun_contract.json `catalogue`,
# copied 2026-10-06): name -> (set, LOD1 file, LOD2 file, shown, casts, glow pass,
# shell). The plan places by it; the manifest carries it for the zone glue.
CATALOG = {
    'sg_seawall_arcade': ('walls', 'sg_seawall_arcade_l1', 'sg_seawall_l2', 'lods', True, 'out', False),
    'sg_seawall_window': ('walls', 'sg_seawall_window_l1', 'sg_seawall_l2', 'lods', True, 'night', False),
    'sg_seawall_l2': ('walls', None, None, 'lod2', False, 'night', False),
    'sg_curtain_land': ('walls', 'sg_curtain_land_l1', 'sg_curtain_land_l2', 'lods', True, 'out', False),
    'sg_curtain_land_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_parados': ('walls', None, None, 'near', False, 'out', False),
    'sg_tower': ('walls', 'sg_tower_l1', 'sg_tower_l2', 'lods', True, 'out', False),
    'sg_tower_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_tower_tall': ('walls', 'sg_tower_tall_l1', 'sg_tower_tall_l2', 'lods', True, 'out', False),
    'sg_tower_tall_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_tower_corner': ('walls', 'sg_tower_corner_l1', 'sg_tower_corner_l2', 'lods', True, 'out', False),
    'sg_tower_corner_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_cone': ('walls', None, None, 'sky', True, 'out', False),
    'sg_seagate': ('walls', 'sg_seagate_l1', 'sg_seagate_l2', 'lods', True, 'night', False),
    'sg_seagate_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_crown_gate': ('walls', 'sg_crown_gate_l1', 'sg_crown_gate_l2', 'lods', True, 'always', True),
    'sg_crown_gate_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_barbican': ('walls', 'sg_barbican_l1', 'sg_barbican_l2', 'lods', True, 'out', True),
    'sg_barbican_l2': ('walls', None, None, 'lod2', False, 'out', False),
    'sg_ditch': ('walls', None, None, 'all', False, 'out', False),
    'sg_ditch_end': ('walls', None, None, 'all', False, 'out', False),
    'sg_scarp': ('walls', None, None, 'all', True, 'out', False),
    'sg_wall_stair': ('walls', None, None, 'all', True, 'out', False),
    'sg_cresset': ('walls', None, None, 'all', False, 'always', False),
    'sg_arch_glow': ('walls', None, None, 'all', False, 'always', False),
    'sg_banner': ('walls', None, None, 'all', False, 'out', False),
    'sg_bastion': ('harbour', 'sg_bastion_l1', 'sg_bastion_l2', 'lods', True, 'out', True),
    'sg_bastion_l2': ('harbour', None, None, 'lod2', False, 'out', False),
    'sg_lighthouse': ('harbour', 'sg_lighthouse_l1', 'sg_lighthouse_l2', 'lods', True, 'always', False),
    'sg_lighthouse_l2': ('harbour', None, None, 'lod2', False, 'out', False),
    'sg_beam': ('harbour', None, None, 'all', False, 'always', False),
    'sg_harbour_wall': ('harbour', None, None, 'all', True, 'out', False),
    'sg_water_gate': ('harbour', None, None, 'all', True, 'out', False),
    'sg_chain_tower': ('harbour', 'sg_chain_tower_l1', 'sg_chain_tower_l2', 'lods', True, 'out', False),
    'sg_chain_tower_l2': ('harbour', None, None, 'lod2', False, 'out', False),
    'sg_mole_bay': ('harbour', None, None, 'all', True, 'out', False),
    'sg_quay': ('harbour', None, None, 'all', True, 'out', False),
    'sg_stair_bay': ('harbour', None, None, 'all', True, 'out', False),
    'sg_warehouse': ('harbour', None, None, 'all', True, 'night', False),   # its lit lofts (fix round 1)
    'sg_pilot_house': ('harbour', None, None, 'all', True, 'out', False),
    'sg_quay_dress': ('harbour', None, None, 'near', False, 'out', False),
    'sg_boat': ('harbour', None, None, 'all', False, 'out', False),
    'sg_house_shop': ('town', 'sg_house_shop_l1', 'sg_house_l2', 'lods', True, 'night', False),
    'sg_house_shut': ('town', 'sg_house_shut_l1', 'sg_house_l2', 'lods', True, 'night', False),
    'sg_house_hoist': ('town', 'sg_house_hoist_l1', 'sg_house_l2', 'lods', True, 'night', False),
    'sg_house_plain': ('town', 'sg_house_plain_l1', 'sg_house_l2', 'lods', True, 'night', False),
    'sg_house_oriel': ('town', 'sg_house_oriel_l1', 'sg_house_l2', 'lods', True, 'night', False),
    'sg_house_l2': ('town', None, None, 'lod2', False, 'night', False),
    'sg_roof_ridge': ('town', None, None, 'sky', True, 'out', False),
    'sg_roof_hip': ('town', None, None, 'sky', True, 'out', False),
    'sg_roof_gable': ('town', None, None, 'sky', True, 'out', False),
    'sg_roof_dormer': ('town', None, None, 'sky', False, 'out', False),
    'sg_stair_turret': ('town', None, None, 'sky', True, 'out', False),
    'sg_street_arch': ('town', 'sg_street_arch_l1', 'sg_street_arch_l2', 'lods', True, 'night', False),
    'sg_street_arch_l2': ('town', None, None, 'lod2', False, 'out', False),
    'sg_market': ('town', None, None, 'near', False, 'out', False),
    'sg_leanto': ('town', None, None, 'near', False, 'out', False),
    'sg_sign': ('town', None, None, 'in', False, 'out', False),
    'sg_court_hall': ('civic', 'sg_court_hall_l1', 'sg_court_hall_l2', 'lods', True, 'night', True),
    'sg_court_hall_l2': ('civic', None, None, 'lod2', False, 'out', False),
    'sg_court_hall_in': ('civic', None, None, 'in', False, 'out', False),
    'sg_clock_tower': ('civic', 'sg_clock_tower_l1', 'sg_clock_tower_l2', 'lods', True, 'out', True),
    'sg_clock_tower_l2': ('civic', None, None, 'lod2', False, 'out', False),
    'sg_clock_tower_in': ('civic', None, None, 'in', False, 'out', False),
    'sg_guild_hall': ('civic', 'sg_guild_hall_l1', 'sg_guild_hall_l2', 'lods', True, 'night', True),
    'sg_guild_hall_l2': ('civic', None, None, 'lod2', False, 'out', False),
    # the close-out pass (2026-10-06): the walled yards and their gardens, the
    # sea step's parapet, the shells' visible handrails, the bay with a room
    'sg_low_wall': ('town', None, None, 'all', True, 'out', False),
    'sg_yard_gate': ('town', None, None, 'all', True, 'out', False),
    'sg_yard_dress': ('town', None, None, 'near', False, 'out', False),
    'sg_well': ('town', None, None, 'near', False, 'out', False),
    'sg_rail': ('walls', None, None, 'in', False, 'out', False),
    'sg_rail_flight': ('walls', None, None, 'in', False, 'out', False),
    # its LOD1 and card are the plain bay's: a door at 45 m reads shut
    'sg_house_open': ('town', 'sg_house_plain_l1', 'sg_house_l2', 'lods', True, 'night', False),
    # fix round 2 (2026-10-07, caerdun_mod_dress.py): the back-lands, the pent roofs and
    # dressed row ends, the market's stalls and carts, the drill ground, the strand's
    # lamps, the job halls' boards
    'sg_backhouse': ('town', None, None, 'all', True, 'night', False),
    'sg_roof_pent': ('town', None, None, 'sky', True, 'out', False),
    'sg_house_end': ('town', None, None, 'all', True, 'night', False),
    'sg_stall': ('town', None, None, 'near', False, 'out', False),
    'sg_cart': ('town', None, None, 'near', False, 'out', False),
    'sg_drill': ('town', None, None, 'near', False, 'out', False),
    'sg_flagpole': ('town', None, None, 'all', True, 'out', False),
    'sg_lamp': ('harbour', None, None, 'all', False, 'always', False),
    'sg_device_shield': ('civic', None, None, 'all', False, 'out', False),
    'sg_device_blades': ('civic', None, None, 'all', False, 'out', False),
    # the auction house (2026-10-11, caerdun_mod_auction.py): the Exchange on the Market
    # Yard, its open hall a shell like the halls' (lit lancets by night)
    'sg_auction_house': ('civic', 'sg_auction_house_l1', 'sg_auction_house_l2', 'lods', True, 'night', True),
    'sg_auction_house_l2': ('civic', None, None, 'lod2', False, 'out', False),
}
# a LOD1 file is its own module's (name_l1); a module may borrow another's
# (sg_house_open shows the plain bay's), which then stays that one's LOD1
LOD1 = {v[1]: k for k, v in CATALOG.items() if v[1] and v[1] == k + '_l1'}
assert all(v[1] in LOD1 for v in CATALOG.values() if v[1]), 'a borrowed LOD1 that no module owns'
FILES = sorted(set(CATALOG) | set(LOD1))
assert set(FILES) == set(G.MODULES), (sorted(set(FILES) ^ set(G.MODULES)))

# What was built differently from the contract's first version, on purpose. Since
# the generator fix these are in contract_gen.py too (its changelog, 2026-10-06);
# the block stays, by key, because the plan reads its copies from here and
# caerdun_modules.test.mjs ties the plan's layout to it.
DEPARTURES = {
    'sg_clock_tower.flights': caerdun_mod_civic.CLOCK_FLIGHTS,
    'sg_clock_tower.holes': [list(h) if h else None for h in caerdun_mod_civic.CLOCK_HOLES],
    'sg_clock_tower.why': "the contract's K0-K4 ran round the four walls and overlapped at every corner (K1's first steps 0.2-0.9 m over K0's last): "
                          'they alternate between the +x and -x walls instead, half, run, rise, x and floors kept',
    'sg_crown_gate.stairwells': {'F2': [-9.4, -5.6, -7.4, -1.6], 'F2s': [7.4, -5.6, 9.4, -1.6], 'F4': [-9.4, -5.6, -7.4, -1.2],
                                 'why': 'the walk gallery crosses over F2 (F2 keeps 2.2 m); F4 opens under the caphouse only where it needs its headroom'},
    'sg_crown_gate.caphouseDoor': {'face': 'x = -7.2 (east)', 'z': list(caerdun_mod_walls.CAP_DOOR_Z), 'y': [24.1, 26.4],
                                   'why': 'F4 arrives facing the back wall; the standard 1.3 m (1.0 m was too tight for the body)'},
    'towerDoors': {'sg_tower': {'z': list(caerdun_mod_walls.TOWER_DOOR_Z), 'y': [11.4, 13.8]}, 'sg_tower_corner': {'half': caerdun_mod_walls.CORNER_DOOR_HALF},
                   'why': "CF-7: the walk meets a bent tower's flank 5 tan(bend/2) m inboard of the door's centre (0.98 m at n5): "
                          "the doors open where the plan's colliders do (layout walls.doors)"},
    'sg_seagate.doors': {'z': list(caerdun_mod_walls.SEAGATE_DOOR_Z), 'y': [11.4, 13.8],
                         'why': "fix round 1: the walk's width less a hand's breadth; at 1.3 m the curtains, meeting the flanks at a bend, left the body 0.24 m"},
    'towerRooms': 'the walk rooms of sg_tower, sg_tower_tall and the Crown Gate towers have their front corners chamfered 1 m inside the outer diagonals; '
                  'the contract rectangles poke 0.17-0.37 m out through the wall there',
    'lod2Cards': 'SG_Far only, cut to the silhouette: curtains and houses a front and a back face, towers, gates, halls and round towers a cross of four faces through the middle',
    'sg_roof_hip': 'END frame (origin on the ridge line in the end plane, +z outward): roofs the end bay (z -4..0.45); its slopes 2 cm over the ridge planes',
    'sg_stair_turret': 'flat crenellated cap (CF-3): 14.9 m to its merlon tops, where an sg_cone sits (the contract size 19.85 was the cone mock-up)',
    'sg_sign': 'the board hangs across the facade on its arm (+z): 0.06 x 1.13 x 1.51 m',
    'sg_lighthouse.core': 'the SG_Beam lamp is a band on the lantern glass at 32.6-33.8 (the glass is opaque: a core inside would never be seen)',
    # the close-out pass: F3 and F4 each split by a half-landing (31 risers at the 0.205
    # maximum against the 30 a flight may have); the whole flight and landing lists, as built
    'sg_crown_gate.flights': caerdun_mod_walls.CROWN_FLIGHTS,
    'sg_crown_gate.landings': caerdun_mod_walls.CROWN_LANDINGS,
    'sg_crown_gate.flightsWhy': 'F3 (walk -> 17.75) and F4 (17.75 -> crown) rose 6.35 m: 31 risers of 0.205 against the 30 a flight may have. '
                                'Each is split by a 1.0 m half-landing in its own lane (16 + 15 risers of 0.2048 on 0.30 treads); the 17.75 '
                                'landing is taken back to z 4.7, and F4b still tops out under the caphouse',
    'sg_house_open.room': caerdun_mod_town.OPEN_ROOM,
    # CF-16 (2026-10-08): the guild halls' great doors stand open on a lit vestibule
    # (the room, door, benches and lamps in the hall's frame, front +z)
    'sg_guild_hall.vestibule': caerdun_mod_civic.VEST,
    # the auction house (2026-10-11): its hall, arcade, belfry, counters, brokers' stands,
    # board and lamps in its own frame (front +z, the Market Yard), for the plan
    'sg_auction_house.hall': caerdun_mod_auction.AH,
}
MAT_RGB = {'SG_Stone': (0.58, 0.6, 0.63), 'SG_Joinery': (0.29, 0.23, 0.17), 'SG_Glass': (0.11, 0.16, 0.2), 'SG_Far': (0.56, 0.58, 0.6),
           'SG_Slate': (0.28, 0.3, 0.33), 'SG_Brass': (0.7, 0.61, 0.37), 'SG_Glow': (0.18, 0.16, 0.15), 'SG_Beam': (0.0, 0.0, 0.0)}
ROUGH = {'SG_Stone': 0.92, 'SG_Joinery': 0.8, 'SG_Glass': 0.15, 'SG_Far': 0.9, 'SG_Slate': 0.85, 'SG_Brass': 0.35, 'SG_Glow': 0.6, 'SG_Beam': 1.0}


def kind_of(name):
    if name in LOD1:
        return 'lod1'
    c = CATALOG[name]
    if c[3] == 'lod2':
        return 'lod2'
    if name.endswith('_in'):
        return 'interior'
    if name.startswith('sg_house_'):
        return 'bay'
    if name in ('sg_seawall_arcade', 'sg_seawall_window', 'sg_curtain_land'):
        return 'curtain'
    if c[6]:
        return 'shell'
    return 'piece'


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*MAT_RGB[name], 1)
    b.inputs['Roughness'].default_value = ROUGH[name]
    b.inputs['Metallic'].default_value = 0.85 if name == 'SG_Brass' else 0.0
    # single-sided: Blender's default exports doubleSided, and Babylon would then
    # draw and shadow the back of every face in the city. Every surface seen from
    # both sides carries its own back face (banners, boats, shutters, cards).
    m.use_backface_culling = True
    return m


def to_objects(g, tint_layer='Tint'):
    """A Geo -> one Blender mesh object per material, game (x, y, z) stored as
    (x, -z, y); the per-corner tint (and the stone's height gradient) as a colour
    attribute."""
    objs = []
    for mat in sorted(g.tris):
        tris = g.tris[mat]
        verts, vmap, faces, uvs, tints = [], {}, [], [], []
        for (P, UV, T, sm) in tris:
            # The weld key carries the face's facing (its normal's dominant axis and
            # sign). Welding by position alone gave a back face -- the same outline
            # on the same plane wound the other way: every LOD2 card's back, the cross
            # cards' -x face -- exactly its front's vertex set, and such a face never
            # reached the GLB (12 of 16 cards vanished from a whole quadrant).
            # Coplanar faces still share vertices; the meshes are flat-shaded, so the
            # exporter splits at every crease anyway.
            u_, w_ = G.sub(P[1], P[0]), G.sub(P[2], P[0])
            nf = (u_[1] * w_[2] - u_[2] * w_[1], u_[2] * w_[0] - u_[0] * w_[2], u_[0] * w_[1] - u_[1] * w_[0])
            ax = max(range(3), key=lambda k: abs(nf[k]))
            side = (ax + 1) * (1 if nf[ax] >= 0 else -1)
            f = []
            for p in P:
                pos = (round(p[0], 4), round(-p[2], 4), round(p[1], 4))
                key = pos + (side,)
                i = vmap.get(key)
                if i is None:
                    i = len(verts)
                    vmap[key] = i
                    verts.append(pos)
                f.append(i)
            if len(set(f)) < 3:
                continue
            faces.append(f)
            uvs.extend(UV)
            for ci, p in enumerate(P):
                gc = 1.0
                if mat == 'SG_Stone' and g.grad:
                    ya, yb, lo = g.grad
                    t = min(1.0, max(0.0, (p[1] - ya) / (yb - ya)))
                    gc = lo + (1 - lo) * t * t * (3 - 2 * t)
                tints.append((T[ci] if isinstance(T, tuple) else T) * gc)
        if not faces:
            continue
        me = bpy.data.meshes.new(f'{g.name}_{mat}')
        me.from_pydata(verts, [], faces)
        uvl = me.uv_layers.new(name='UVMap')
        flat = []
        for (u, v) in uvs:
            flat += [round(u * 32768) / 32768, round((1 - v) * 32768) / 32768]   # glTF top-left -> Blender bottom-left
        uvl.data.foreach_set('uv', flat)
        ca = me.color_attributes.new(tint_layer, 'BYTE_COLOR', 'CORNER')
        ca.data.foreach_set('color', [c for t in tints for c in (min(1.0, t), min(1.0, t), min(1.0, t), 1.0)])
        me.update()
        o = bpy.data.objects.new(f'{g.name}_{mat}', me)
        bpy.context.collection.objects.link(o)
        me.materials.append(material(mat))
        objs.append(o)
    return objs


# Materials that never take the baked occlusion: SG_Far's pictures are renders of
# the LOD0 that already carry its light and occlusion (multiplying a vertex bake in
# darkened them twice: the cross cards' coincident planes baked to 0, so every
# tower, gate and hall card went to 0.42 and read as a dark blob at 140 m), and
# SG_Beam is additive light. Their COLOR_0 is the tint alone.
NO_AO = {'SG_Far', 'SG_Beam'}


def bake_and_export(g, objs, path):
    """Bake ambient occlusion into the one colour layer, multiply the tint in, export.
    Returns whether any part took a bake (False for a card or the beam)."""
    vl = bpy.context.view_layer
    need = any(o.data.materials[0].name not in NO_AO for o in objs)
    for o in objs:
        col = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = col
    ground = None
    if g.ground is not None:
        bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, g.ground - 0.01))
        ground = bpy.context.active_object
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.device = 'CPU'
    sc.cycles.seed = 9401
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = g.ao
    baked = False
    try:
        if not need:
            raise StopIteration
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.object.bake(type='AO')
        baked = True
    except StopIteration:
        pass
    except Exception as e:
        print('AO bake failed', g.name, e)
    if ground:
        bpy.data.objects.remove(ground, do_unlink=True)
    for o in objs:
        ca, ti = o.data.color_attributes['Col'], o.data.color_attributes['Tint']
        n = len(ca.data)
        a = [0.0] * (4 * n)
        t = [0.0] * (4 * n)
        ca.data.foreach_get('color', a)
        ti.data.foreach_get('color', t)
        takes = baked and o.data.materials[0].name not in NO_AO
        out = []
        for i in range(n):
            ao = (0.42 + 0.58 * a[4 * i]) if takes else 1.0
            v = max(0.0, min(1.0, ao * t[4 * i]))
            out += [v, v, v, 1.0]
        ca.data.foreach_set('color', out)
        o.data.color_attributes.remove(ti)
        o.data.color_attributes.active_color = o.data.color_attributes['Col']
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    # only 'Col' as COLOR_0 (the Blender 5.2 trap: see the header)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_apply=True, export_animations=False,
                              export_vertex_color='NAME', export_vertex_color_name='Col', export_all_vertex_colors=False,
                              export_image_format='NONE')
    return baked


def glb_tris(path):
    """Triangles in an exported GLB, read from its JSON chunk."""
    import struct
    b = Path(path).read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    return sum(j['accessors'][p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'])


# ------------------------------------------------------------------ the pictures
SHEET_FILES = {'SG_Stone': ('sg_stone.png', None), 'SG_Joinery': ('sg_joinery.png', 'sg_joinery_e.png'), 'SG_Glass': ('sg_glass.png', 'sg_glass_e.png'),
               'SG_Slate': ('sg_slate.png', None), 'SG_Glow': ('sg_glow.png', 'sg_glow_e.png'), 'SG_Far': ('sg_far.png', 'sg_far_e.png'),
               'SG_Brass': (None, None), 'SG_Beam': (None, None)}
LIGHT = (-0.35, 0.5, 0.8)        # the pictures' fixed light, in Blender axes: game (-0.35, 0.8, -0.5), high and from the left
DIST = 150.0


# the facing of a view's card in Blender axes (game (x, y, z) is Blender (x, -z, y))
VIEW_N = {'front': (0.0, -1.0, 0.0), 'back': (0.0, 1.0, 0.0), 'right': (1.0, 0.0, 0.0), 'left': (-1.0, 0.0, 0.0)}
SHADE = (0.55, 1.15)            # the fixed light's range over n.L in -1..1
AO_RANGE = (0.45, 1.0)          # the picture's occlusion, per pixel within 1.2 m
# The pictures carry no cast shadow (unlit renders), and the LOD0 casts its own in
# game (the machicolations' oversail, the reveals): relative light alone left the
# LOD1s and cards 7% brighter than their LOD0s on average (MEASURED, EEVEE sun and
# sky, the shipped GLBs with the facade bound, 21 modules from two sides:
# tmp/caerdun-redesign/gen-fix/bright.py). DAY_GAIN takes that back.
DAY_GAIN = 0.94


def shade_of(n):
    ln = math.sqrt(sum(c * c for c in LIGHT))
    d = sum(a * b / ln for a, b in zip(n, LIGHT))
    return SHADE[0] + (SHADE[1] - SHADE[0]) * (d + 1) / 2


def render_material(name, night, cache, side='front'):
    """A picture's material. By day: sheet x tint x the fixed light x occlusion,
    unlit. The light is RELATIVE to the card's own facing (a part facing the way
    the card faces renders at 1.0): the game lights the LOD1 face or card again by
    its own normal, as it lights the LOD0, so the picture carries only the light's
    differences across the module (a reveal, a slope) and its occlusion. An
    absolute light rendered every front-facing picture at 0.70 and every back one
    at 1.0, and the LOD switches popped by up to a fifth."""
    key = (name, night, side)
    if key in cache:
        return cache[key]
    m = bpy.data.materials.new(('N_' if night else 'R_') + name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    alb, emi = SHEET_FILES[name]
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'

    def tex(f):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(str(BUILD / f))
        t.extension = 'REPEAT'
        t.interpolation = 'Linear'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        return t
    if night:
        if name == 'SG_Beam':
            em.inputs['Color'].default_value = (1.0, 0.945, 0.784, 1)
        elif emi:
            nt.links.new(tex(emi).outputs['Color'], em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = (0, 0, 0, 1)
    else:
        tint = nt.nodes.new('ShaderNodeVertexColor')
        tint.layer_name = 'Tint'
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        dotn = nt.nodes.new('ShaderNodeVectorMath')
        dotn.operation = 'DOT_PRODUCT'
        L = LIGHT
        ln = math.sqrt(sum(c * c for c in L))
        dotn.inputs[1].default_value = tuple(c / ln for c in L)
        shade = nt.nodes.new('ShaderNodeMapRange')
        sv = shade_of(VIEW_N[side])
        shade.inputs['From Min'].default_value = -1.0
        shade.inputs['From Max'].default_value = 1.0
        shade.inputs['To Min'].default_value = DAY_GAIN * SHADE[0] / sv
        shade.inputs['To Max'].default_value = DAY_GAIN * SHADE[1] / sv
        nt.links.new(geo.outputs['Normal'], dotn.inputs[0])
        nt.links.new(dotn.outputs['Value'], shade.inputs['Value'])
        ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = 1.2
        aom = nt.nodes.new('ShaderNodeMapRange')
        aom.inputs['To Min'].default_value = AO_RANGE[0]
        aom.inputs['To Max'].default_value = AO_RANGE[1]
        nt.links.new(ao.outputs['AO'], aom.inputs['Value'])
        mul = []
        for _ in range(3):
            mx = nt.nodes.new('ShaderNodeMixRGB')
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Fac'].default_value = 1.0
            mul.append(mx)
        if alb:
            nt.links.new(tex(alb).outputs['Color'], mul[0].inputs['Color1'])
        else:
            mul[0].inputs['Color1'].default_value = (*MAT_RGB[name], 1)
        nt.links.new(tint.outputs['Color'], mul[0].inputs['Color2'])
        nt.links.new(mul[0].outputs['Color'], mul[1].inputs['Color1'])
        nt.links.new(shade.outputs['Result'], mul[1].inputs['Color2'])
        nt.links.new(mul[1].outputs['Color'], mul[2].inputs['Color1'])
        nt.links.new(aom.outputs['Result'], mul[2].inputs['Color2'])
        nt.links.new(mul[2].outputs['Color'], em.inputs['Color'])
    cache[key] = m
    return m


def camera_for(side, uc, vc, near=None):
    """An orthographic camera on `side` looking back at the origin's plane."""
    # game position of the camera, then (x, -z, y) for Blender
    if side == 'front':
        pos, rot = (uc, vc, DIST), (math.pi / 2, 0, 0)
    elif side == 'back':
        pos, rot = (-uc, vc, -DIST), (math.pi / 2, 0, math.pi)
    elif side == 'right':
        pos, rot = (DIST, vc, -uc), (math.pi / 2, 0, math.pi / 2)
    else:
        pos, rot = (-DIST, vc, uc), (math.pi / 2, 0, -math.pi / 2)
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.clip_start = 0.1 if near is None else DIST - near
    cam_d.clip_end = 2 * DIST + 50
    cam = bpy.data.objects.new('cam', cam_d)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (pos[0], -pos[2], pos[1])
    cam.rotation_euler = rot
    return cam


def render_views():
    """Every picture: an orthographic render of its LOD0 module by day (sheet x tint
    x a fixed light x ambient occlusion, unlit, so the same in any scene) and by
    night (the emissive sheets only), Cycles with a fixed seed: deterministic."""
    rd = BUILD / '_renders'
    rd.mkdir(parents=True, exist_ok=True)
    man = {}
    jobs = [(k, v[0], v[1], A.view_window(k)) for k, v in sorted(A.ALL_VIEWS.items())]
    jobs.append(('l1_arc', 'sg_seawall_arcade', 'front', ((-2.0, 2.0, 7.9, 13.4), (128, 176))))
    for (key, mod, side, ((u0, u1, v0, v1), (pw, ph))) in jobs:
        for night in (False, True):
            if night and key == 'l1_arc':
                continue
            bpy.ops.wm.read_factory_settings(use_empty=True)
            sc = bpy.context.scene
            g = G.MODULES[mod]()
            cache = {}
            for o in to_objects(g):
                for i, sl in enumerate(o.material_slots):
                    o.data.materials[i] = render_material(sl.material.name, night, cache, side)
            cam = camera_for(side, (u0 + u1) / 2, (v0 + v1) / 2, A.VIEW_NEAR.get(key))
            cd = cam.data
            if pw >= ph:
                cd.sensor_fit = 'HORIZONTAL'
                cd.ortho_scale = u1 - u0
            else:
                cd.sensor_fit = 'VERTICAL'
                cd.ortho_scale = v1 - v0
            sc.camera = cam
            sc.render.engine = 'CYCLES'
            sc.cycles.device = 'CPU'
            sc.cycles.samples = 48
            sc.cycles.seed = 77
            sc.cycles.use_denoising = False
            sc.render.film_transparent = not night
            sc.render.resolution_x, sc.render.resolution_y = pw, ph
            sc.render.resolution_percentage = 100
            sc.render.image_settings.file_format = 'PNG'
            sc.render.image_settings.color_mode = 'RGB' if night else 'RGBA'
            sc.render.image_settings.compression = 15
            # no stamped metadata (date, render time): the renders are byte-identical too
            for k in dir(sc.render):
                if k.startswith('use_stamp'):
                    try:
                        setattr(sc.render, k, False)
                    except (AttributeError, TypeError):
                        pass
            sc.view_settings.view_transform = 'Standard'
            sc.view_settings.look = 'None'
            w = bpy.data.worlds.new('w')
            w.use_nodes = True
            w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
            sc.world = w
            f = f'{key}_e.png' if night else f'{key}.png'
            sc.render.filepath = str(rd / f)
            bpy.ops.render.render(write_still=True)
            man.setdefault(key, {})['night' if night else 'file'] = f
    (rd / 'renders.json').write_text(json.dumps(man, indent=1, sort_keys=True) + '\n')
    r = subprocess.run(['python3', str(HERE / 'paint_caerdun_textures.py'), '--compose'], capture_output=True, text=True, env=os.environ.copy())
    print(r.stdout.strip(), r.stderr.strip()[-800:])
    if r.returncode:
        raise SystemExit('compose failed')


# ------------------------------------------------------------------ the build
def main():
    t0 = time.time()
    if PAINT and ONLY is None:
        r = subprocess.run(['python3', str(HERE / 'paint_caerdun_textures.py')], capture_output=True, text=True, env=os.environ.copy())
        print(r.stdout.strip(), r.stderr.strip()[-800:])
        if r.returncode:
            raise SystemExit('paint failed')
    mpath = OUT / 'manifest.json'
    old = json.loads(mpath.read_text()) if (ONLY is not None and mpath.exists()) else {}
    files = dict(old.get('files', {}))
    for name in FILES:
        if ONLY is not None and name not in ONLY:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        g = G.MODULES[name]()
        objs = to_objects(g)
        tris = sum(len(o.data.polygons) for o in objs)
        verts = [v.co for o in objs for v in o.data.vertices]
        lo = [min(c[i] for c in verts) for i in range(3)]
        hi = [max(c[i] for c in verts) for i in range(3)]
        baked = bake_and_export(g, objs, OUT / f'{name}.glb')
        tris = glb_tris(OUT / f'{name}.glb')         # what ships: the exporter drops degenerate faces
        rec = {'file': f'{name}.glb', 'kind': kind_of(name), 'set': CATALOG[LOD1.get(name, name)][0], 'tris': tris,
               'materials': sorted(o.data.materials[0].name for o in objs), 'aoBaked': baked,
               'min': [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3)], 'max': [round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)]}
        if name in LOD1:
            rec['lodOf'] = LOD1[name]
        files[name] = rec
        print(f'  {name:24s} {tris:6d} tris  {rec["materials"]}', flush=True)
    if RENDERS:
        render_views()
    modules = {}
    for name, (st, l1, l2, mask, casts, glow, shell) in CATALOG.items():
        lods = [name] + ([l1] if l1 else []) + ([l2] if l2 else [])
        modules[name] = {'set': st, 'lods': lods, 'shown': mask, 'casts': casts, 'glow': glow, 'shell': shell}
    materials = {}
    for m in A.MATERIALS:
        s = A.SHEETS[m]
        rec = {'roughness': ROUGH[m]}
        if s.get('facade'):
            rec['facade'] = s['facade']
        elif s.get('file'):
            rec['albedo'] = s['file']
        if s.get('emissive'):
            rec['emissiveTexture'] = s['emissive']
        materials[m] = rec
    materials['SG_Brass'].update({'color': '#b39b5e', 'metallic': 0.85, 'emissive': '#120d04'})
    materials['SG_Glow'].update({'color': '#2e2925', 'emissiveNight': '#ffcf88', 'glow': 0.8})
    materials['SG_Beam'].update({'color': '#000000', 'emissive': '#fff1c8', 'additive': True, 'unlit': True, 'glow': 1.6,
                                 'about': "no sheet of its own: its UVs are on sg_glow's e_beam / e_lamp pictures (bind sg_glow_e.png as its colour for the falloff)"})
    manifest = {
        'about': "Caerdun's Sea Gate module library, generated by tools/assets/build_caerdun_modules.py -- do not edit by hand. "
                 'The triangle ceilings live in client/test/caerdun_modules.test.mjs, never here.',
        'units': 'metres', 'up': 'Y', 'outward': '+Z',
        'datums': {'datums': G.DATUMS, 'shellDatums': G.SHELL},
        'lodDistances': {'lod1': 45, 'lod2': 140, 'note': 'metres from the camera to the culling cell (contract section 6)'},
        'limits': {'materials': 8, 'materialsOnDisk': 4, 'submeshesAfterFacade': 3, 'lod1Ratio': 0.25},
        'materials': materials,
        'facade': json.loads((OUT / 'sg_facade.json').read_text()) if (OUT / 'sg_facade.json').exists() else None,
        'atlas': A.manifest_layout(),
        'views': {k: {'module': v[0], 'side': v[1], 'window': [round(c, 4) for c in A.view_window(k)[0]], 'px': list(A.view_window(k)[1]),
                      'rect': list(A.FAR_RECTS[k])} for k, v in sorted(A.ALL_VIEWS.items())},
        'pave': A.PAVE,
        'backFaceCulling': 'every material is single-sided (glTF doubleSided false): keep backFaceCulling on',
        'vertexColor': 'baked ambient occlusion x per-surface tint in COLOR_0; set useVertexColors, hasVertexAlpha = false',
        'uv': 'glTF convention (origin top-left): load every sheet with invertY = false',
        'departures': DEPARTURES,
        'modules': modules,
        'files': {k: files[k] for k in sorted(files)},
    }
    mpath.write_text(json.dumps(manifest, indent=1, sort_keys=False) + '\n')
    if ONLY is None:
        for f in sorted(OUT.glob('*.glb')):
            if f.stem not in files:
                print('  removed stale', f.name)
                f.unlink()
    print(f'CAERDUN MODULES {len(modules)} modules, {len(files)} files, {sum(v["tris"] for v in files.values())} tris, in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
