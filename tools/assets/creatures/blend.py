"""Blender glue for the creature kit: meshes, decimation, UVs, the armature,
skin weights, actions and the glTF export. Everything that needs bpy lives
here; the shapes, skeletons, poses and paint are numpy (sdf.py, skeleton.py,
paint.py) and arrive as arrays.

Axes: creature space is the game's (y up, +z forward). Blender is z up and its
glTF exporter maps Blender -y to glTF +z, so creature (x, y, z) goes in as
Blender (x, -z, y) -- a proper rotation, so bone-local rotations are unchanged
and the exported file faces glTF +z, which the game's loader keeps as +z.
"""
from __future__ import annotations

import math
import bpy
import bmesh
import numpy as np

C2B = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)  # creature -> blender
B2C = C2B.T


def to_bl(P):
    return np.asarray(P, float) @ C2B.T


def to_cr(P):
    return np.asarray(P, float) @ B2C.T


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures):
        for x in list(c):
            c.remove(x)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def activate(obj):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def make_mesh(name, verts_cr, faces):
    me = bpy.data.meshes.new(name)
    v = to_bl(verts_cr)
    me.from_pydata([tuple(p) for p in v], [], [tuple(int(i) for i in f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    return link(bpy.data.objects.new(name, me))


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def decimate(obj, target_tris):
    """Collapse-decimate to about target_tris triangles (UVs and attributes ride
    along). The collapse can stall early on a piece with sharp creases; a
    second and third pass from where it stopped usually gets there."""
    for _ in range(4):
        now = tri_count(obj)
        if now <= target_tris * 1.08:
            return now
        activate(obj)
        m = obj.modifiers.new("dec", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = max(0.0005, target_tris / now)
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
        if tri_count(obj) > now * 0.97:  # no progress: merge near-duplicates and retry
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
            bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-5)
            bm.to_mesh(obj.data)
            bm.free()
    return tri_count(obj)


def voxel_remesh(obj, size):
    activate(obj)
    m = obj.modifiers.new("vox", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = size
    m.adaptivity = 0.0
    m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=m.name)


def triangulate(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()


def get_verts(obj):
    me = obj.data
    a = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", a)
    return to_cr(a.reshape(-1, 3))


def set_verts(obj, P_cr):
    me = obj.data
    me.vertices.foreach_set("co", to_bl(P_cr).astype(np.float32).ravel())
    me.update()


def shade(obj, angle_deg=None):
    """Smooth everywhere, or smooth with hard edges past angle_deg (armour)."""
    me = obj.data
    me.shade_smooth()
    if angle_deg is not None:
        me.set_sharp_from_angle(angle=math.radians(angle_deg))


def set_face_int(obj, name, value):
    me = obj.data
    at = me.attributes.get(name) or me.attributes.new(name, "INT", "FACE")
    at.data.foreach_set("value", np.full(len(me.polygons), value, dtype=np.int32))


def join(objs, name):
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    bad = o.data.validate(verbose=True, clean_customdata=False)
    if bad:
        print(f"  {name}: mesh repaired by validate()")
    return o


def duplicate(obj, name):
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    o.data.name = name
    return link(o)


def smart_uv(obj, angle=62, margin=0.004, uv_scale=1.0):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # smart project fills the unit square per object, whatever its size; put
    # every piece at the same texel density (times uv_scale) before packing
    me = obj.data
    me.calc_loop_triangles()
    lt = me.loop_triangles
    T = len(lt)
    tl = np.zeros(T * 3, dtype=np.int64)
    lt.foreach_get("loops", tl)
    tv = np.zeros(T * 3, dtype=np.int64)
    lt.foreach_get("vertices", tv)
    uv = me.uv_layers.active.data
    a = np.zeros(len(uv) * 2)
    uv.foreach_get("uv", a)
    U = a.reshape(-1, 2)[tl].reshape(T, 3, 2)
    P = get_verts(obj)[tv].reshape(T, 3, 3)
    uv_area = 0.5 * np.abs(np.cross(U[:, 1] - U[:, 0], U[:, 2] - U[:, 0])).sum()
    area = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1).sum()
    f = math.sqrt(area / max(uv_area, 1e-12)) * uv_scale
    uv.foreach_set("uv", a * f)


def pack_uv(obj, margin=0.004):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def mesh_tris(obj):
    """Triangles as arrays: positions (V,3) creature space, tri vertex indices
    (T,3), tri uvs (T,3,2), per-vertex normals (V,3) creature space, and the
    face 'part' attribute per triangle."""
    me = obj.data
    me.calc_loop_triangles()
    lt = me.loop_triangles
    T = len(lt)
    tv = np.zeros(T * 3, dtype=np.int64)
    lt.foreach_get("vertices", tv)
    tl = np.zeros(T * 3, dtype=np.int64)
    lt.foreach_get("loops", tl)
    tp = np.zeros(T, dtype=np.int64)
    lt.foreach_get("polygon_index", tp)
    uv = me.uv_layers.active.data
    a = np.zeros(len(uv) * 2)
    uv.foreach_get("uv", a)
    a = a.reshape(-1, 2)
    tuv = a[tl].reshape(T, 3, 2)
    P = get_verts(obj)
    n = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", n)
    N = to_cr(n.reshape(-1, 3))
    part = np.zeros(len(me.polygons), dtype=np.int64)
    at = me.attributes.get("part")
    if at:
        b = np.zeros(len(me.polygons), dtype=np.int32)
        at.data.foreach_get("value", b)
        part = b.astype(np.int64)
    # corner normals respect the hard edges the armour asked for
    cn = np.zeros(len(me.loops) * 3)
    me.corner_normals.foreach_get("vector", cn) if hasattr(me, "corner_normals") else None
    CN = to_cr(cn.reshape(-1, 3))[tl].reshape(T, 3, 3) if hasattr(me, "corner_normals") else N[tv.reshape(T, 3)]
    return P, tv.reshape(T, 3), tuv, N, part[tp], CN


def vertex_parts(obj):
    me = obj.data
    part = np.zeros(len(me.polygons), dtype=np.int32)
    at = me.attributes.get("part")
    if at:
        at.data.foreach_get("value", part)
    vp = np.zeros(len(me.vertices), dtype=np.int64)
    loops = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loops)
    starts = np.zeros(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_start", starts)
    totals = np.zeros(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_total", totals)
    poly_of_loop = np.repeat(np.arange(len(me.polygons)), totals)
    vp[loops] = part[poly_of_loop]
    return vp


def edges(obj):
    me = obj.data
    e = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    return e.reshape(-1, 2)


# --------------------------------------------------------------------------- armature

def make_armature(sk, name="Armature"):
    arm = bpy.data.armatures.new(name)
    obj = link(bpy.data.objects.new(name, arm))
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    for n, b in sk.bones.items():
        eb = arm.edit_bones.new(n)
        eb.head = tuple(to_bl(b.head))
        eb.tail = tuple(to_bl(b.tail))
        eb.align_roll(tuple(to_bl(b.zhint)))
        if b.parent:
            eb.parent = arm.edit_bones[b.parent]
            eb.use_connect = False
        eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    # check the frames Blender built against ours: a mismatch would play every
    # authored rotation about the wrong axes
    for n, b in sk.bones.items():
        M = np.array(arm.bones[n].matrix_local)[:3, :3]
        want = C2B @ b.R
        err = np.abs(M - want).max()
        assert err < 1e-3, f"bone frame mismatch {n}: {err}"
    return obj


def set_weights(obj, names, W):
    """W: (V, B) weights over `names`; at most four non-zero per row."""
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    groups = [obj.vertex_groups.new(name=n) for n in names]
    V, B = W.shape
    for b in range(B):
        idx = np.nonzero(W[:, b] > 1e-4)[0]
        if not len(idx):
            continue
        g = groups[b]
        for w in np.unique(np.round(W[idx, b], 4)):
            sel = idx[np.round(W[idx, b], 4) == w]
            g.add([int(i) for i in sel], float(w), "REPLACE")


def bind(obj, arm_obj):
    obj.parent = arm_obj
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = arm_obj


def write_clips(arm_obj, clips, fps=30):
    """clips: {name: frames} from skeleton.sample_clip. Each becomes an action
    on its own NLA track, which the exporter turns into one glTF animation."""
    from bpy_extras import anim_utils
    scene = bpy.context.scene
    scene.render.fps = fps
    arm_obj.animation_data_create()
    ad = arm_obj.animation_data
    for cname, frames in clips.items():
        act = bpy.data.actions.new(cname)
        act.use_fake_user = True
        slot = act.slots.new(id_type="OBJECT", name=arm_obj.name)
        ad.action = act
        ad.action_slot = slot
        cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
        nf = len(frames)
        times = np.arange(nf, dtype=np.float64) + 1.0
        for bname in frames[0]:
            q = np.array([frames[i][bname][0] for i in range(nf)])
            l = np.array([frames[i][bname][1] for i in range(nf)])
            s = np.array([frames[i][bname][2] for i in range(nf)])
            path = f'pose.bones["{bname}"]'
            chans = [("rotation_quaternion", q, 4)]
            if np.abs(l).max() > 1e-6:
                chans.append(("location", l, 3))
            if np.abs(s - 1).max() > 1e-6:
                chans.append(("scale", s, 3))
            for prop, arr, w in chans:
                for ci in range(w):
                    fc = cb.fcurves.new(f"{path}.{prop}", index=ci)
                    fc.keyframe_points.add(nf)
                    co = np.empty(nf * 2)
                    co[0::2] = times
                    co[1::2] = arr[:, ci]
                    fc.keyframe_points.foreach_set("co", co)
                    fc.keyframe_points.foreach_set("interpolation", np.full(nf, 2, dtype=np.int32))  # LINEAR
                    fc.update()
        ad.action = None
        tr = ad.nla_tracks.new()
        tr.name = cname
        st = tr.strips.new(cname, 1, act)
        st.action_slot = slot
        tr.mute = False
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"


# --------------------------------------------------------------------------- material and export

def image_from(name, rgb, save_dir):
    """rgb: (H, W, 3) floats 0..1 sRGB, row 0 = top of the image (v = 1).
    Saved as a PNG first and loaded back: a generated image's pixel buffer
    does not reliably reach the glTF exporter, a file on disk does. The PNG
    stays in save_dir (gitignored tmp/) to look at."""
    import os
    H, W, _ = rgb.shape
    img = bpy.data.images.new(name, W, H, alpha=False)
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[..., :3] = rgb[::-1]
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(save_dir, exist_ok=True)
    path = os.path.join(save_dir, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "sRGB"
    return img


def make_material(name, base_img, emit_img=None, emit_strength=1.0, roughness=0.62, metallic=0.0, rough_img=None):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    mat.use_backface_culling = True  # glTF doubleSided false: closed bodies need no back faces
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = base_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if rough_img is not None:
        # glTF metallic-roughness: G = roughness, B = metallic
        rt = nt.nodes.new("ShaderNodeTexImage")
        rt.image = rough_img
        rt.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(rt.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if emit_img is not None:
        et = nt.nodes.new("ShaderNodeTexImage")
        et.image = emit_img
        nt.links.new(et.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat


def export_glb(path, jpeg_quality=88):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=False,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials="EXPORT", export_image_format="AUTO",  # PNG: ktx2.py encodes it once
        export_jpeg_quality=jpeg_quality, export_image_quality=jpeg_quality,
        export_skins=True, export_influence_nb=4, export_all_influences=False,
        export_def_bones=False, export_leaf_bone=False, export_rest_position_armature=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
        export_frame_step=1, export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True, export_reset_pose_bones=True,
        export_anim_slide_to_zero=True, export_extras=False, export_cameras=False, export_lights=False,
    )
