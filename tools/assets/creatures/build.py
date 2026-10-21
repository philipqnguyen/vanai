"""Build creature GLBs from their specs, headless in Blender.

    blender -b --factory-startup --python tools/assets/creatures/build.py -- [key | plan ...] [--fast] [--key]

Arguments are creature keys or plan files (`canine`, `uniques/gnarlfang`);
none builds everything. Creatures are discovered: every module under plans/
(plans/<body plan>.py, plans/uniques/<monster>.py) that defines
CREATURES = {key: function returning a Spec} is built, and nothing else lists
them. Only the plan files the names need are imported (discover()), so a
plan another worker is half-way through editing cannot break this build. A creature's key is its GLB name: the plan's look for a shared look
("wolf"), the monster's key for a unique ("gnarlfang"); which monsters wear it
comes from tools/data/bestiary_plan.json via client/src/creature-looks.json
(tools/data/bestiary_looks.mjs), never from the spec. Each creature writes only its own
outputs, so plans build in parallel without touching each other:

  client/public/models/creatures/<key>.glb   the model
  client/src/creatures/<key>.json            its measured stats and the
                                             monsters that wear it (the client
                                             and the node tests read these)
  client/public/models/creatures/<key>@<variant>.ktx2   each palette variant's atlas
  tmp/bestiary/atlas/<key>_*.png             the painted maps, to look at

Built and checked with Blender 5.2.0 LTS. BESTIARY.md is the guide.

The pipeline, per creature:
  1. organic body: SDF -> surface nets -> collapse-decimate to the budget ->
     vertices pulled back onto the true surface (decimation shrinks curves)
  2. rigid parts the same way, each at its own voxel size and budget
  3. UVs: smart project per piece (eyes and faces may ask for more texels),
     joined and packed into one atlas; LOD1 is LOD0 decimated with its UVs
  4. skin weights from the SDF leaves (weights.py) for both LODs
  5. the atlas painted texel by texel from the 3D description (paint.py)
  6. armature, clips sampled from the plan's pose functions, glTF export
  7. the ground clamp (ground_clips.py): the root lifted wherever a clip
     drives the body into the ground
"""
from __future__ import annotations

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import blend  # noqa: E402
import ground_clips  # noqa: E402
import ktx2  # noqa: E402
import quantize  # noqa: E402
import paint  # noqa: E402
import sdf  # noqa: E402
import weights  # noqa: E402
from skeleton import sample_clip  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "models", "creatures")
STATS = os.path.join(ROOT, "client", "src", "creatures")  # one <key>.json per creature
SCRATCH = os.path.join(ROOT, "tmp", "bestiary", "atlas")  # gitignored: the painted atlases as PNGs
FPS = 30


def mesh_piece(name, node, voxel, tris, pid, angle, uv_scale, uv_angle):
    lo, hi = node.bounds() if hasattr(node, "bounds") else node.lo_hi()
    t0 = time.time()
    V, Q = sdf.surface_nets(node.eval, lo, hi, voxel, project=True)
    obj = blend.make_mesh(name, V, Q)
    # surface nets can pinch where a surface passes a cell twice (thin rims,
    # grooves); those non-manifold edges stall the decimator. OpenVDB's voxel
    # remesh at the same size rebuilds the piece watertight first.
    blend.voxel_remesh(obj, voxel * 0.8)
    got = blend.decimate(obj, tris)
    # decimation pulls convex curves inward; put the vertices back on the surface
    P = blend.get_verts(obj)
    for _ in range(3):
        P = sdf.project_to_surface(node.eval, P, voxel * 0.5)
    blend.set_verts(obj, P)
    blend.triangulate(obj)
    blend.shade(obj, angle)
    blend.set_face_int(obj, "part", pid)
    blend.smart_uv(obj, angle=uv_angle, uv_scale=uv_scale)
    print(f"  {name}: {len(Q)} quads -> {got} tris ({time.time() - t0:.1f}s)")
    return obj


def _has_bone(node):
    return any(lf.weight and lf.bone for lf in node.leaves())


def rigid_bones(node, P):
    """The bone each point of a rigid part goes to: the shape it lies on.

    A Body hands each point to the one of its added shapes (each with its own
    cuts) whose surface is nearest, and that shape decides in turn, down to a
    leaf; cuts and intersections never claim a point themselves, Shells pass
    through and an Xform's shapes are measured in its own frame.

    Rigid-nearest skinning once took the nearest of every leaf, cuts included,
    so a floor-intersect box silently claimed every vertex lying on the ground
    (the pike's pectoral fans came off with it), a boneless cut leaf crashed
    the build, and an Xform's leaves were measured in creature space. Two
    mirrored halves of one shape (the beetle's elytra: the same dome, each cut
    to its side) are told apart by their cut surfaces. (2026-10-13)"""
    out = np.empty(len(P), dtype=object)
    if len(P) == 0:
        return out
    if isinstance(node, sdf.Xform):
        return rigid_bones(node.node, (P - node.t) @ node.R)
    if isinstance(node, sdf.Shell):
        return rigid_bones(node.node, P)
    if isinstance(node, sdf.Leaf):
        out[:] = node.bone
        return out
    if isinstance(node, sdf.Body):
        added = [nd for op, nd, _k in node.items if op == "add" and _has_bone(nd)]
        if added:
            if len(added) == 1:
                return rigid_bones(added[0], P)
            best = np.stack([nd.eval(P) for nd in added], 1).argmin(1)
            for i, nd in enumerate(added):
                m = best == i
                if m.any():
                    out[m] = rigid_bones(nd, P[m])
            return out
    leaves = [lf for lf in node.leaves() if lf.weight and lf.bone]
    D = np.stack([lf.eval(P) for lf in leaves], 1)
    out[:] = [leaves[i].bone for i in D.argmin(1)]
    return out


def skin(spec, obj):
    P = blend.get_verts(obj)
    vp = blend.vertex_parts(obj)
    names = spec.sk.names()
    part_bones = {}
    leaves_by_part = {}
    organic = [0]
    for i, p in enumerate(spec.parts):
        if p.bones == "organic":  # wrappings and skin-tight cloth bend with the body under them
            organic.append(i + 1)
        elif p.bones:
            part_bones[i + 1] = p.bones
        else:
            assert _has_bone(p.node), f"{spec.key}: part {p.name} has no leaf with a bone to claim its vertices"
            leaves_by_part[i + 1] = p.node
    W = weights.skin_weights(P, vp, spec.body.leaves(), part_bones, names, spec.falloff,
                             edges=blend.edges(obj), organic_parts=tuple(organic))
    # rigid-nearest parts: each vertex wholly to its nearest leaf's bone
    col = {n: i for i, n in enumerate(names)}
    for pid, node in leaves_by_part.items():
        m = vp == pid
        if not m.any():
            continue
        Wm = np.zeros((m.sum(), len(names)))
        Wm[np.arange(m.sum()), [col[b] for b in rigid_bones(node, P[m])]] = 1.0
        W[m] = Wm
    empty = W.sum(1) < 0.5
    if empty.any():
        ids, counts = np.unique(vp[empty], return_counts=True)
        raise RuntimeError(f"{obj.name}: {empty.sum()} vertices with no bone, parts {dict(zip(ids.tolist(), counts.tolist()))}")
    blend.set_weights(obj, names, W)


def glb_facts(path):
    """What the written file holds -- triangles per mesh, image sizes -- so the
    index reports the GLB, not Blender's count before export."""
    import struct
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + n])
    tris = {m["name"]: j["accessors"][m["primitives"][0]["indices"]]["count"] // 3 for m in j["meshes"]}
    return tris, j


def write_map(rgb, path, linear=False):
    """A painted map as KTX2 beside the GLB (a variant's atlas): PNG out of
    Blender, then basisu -- one lossy step."""
    import bpy
    H, W, _ = rgb.shape
    img = bpy.data.images.new(os.path.basename(path), W, H, alpha=False)
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[..., :3] = rgb[::-1]
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = "PNG"
    os.makedirs(SCRATCH, exist_ok=True)
    png = os.path.join(SCRATCH, os.path.basename(path).replace(".ktx2", ".png"))
    img.save(filepath=png)
    bpy.data.images.remove(img)
    tmp = path + ".tmp"
    ktx2.encode(png, tmp, linear=linear)
    os.replace(tmp, path)
    return os.path.getsize(path)


def paint_variants(spec, fn, variants, tris_arr, size, base_imgs):
    """Each palette variant (creature-looks.json, from the plan) repainted by
    the look's own spec function on the same mesh and UVs: <key>@<id>.jpg, plus
    an emissive / metal-rough map where it differs from the base's."""
    import glob
    for old in glob.glob(os.path.join(OUT, f"{spec.key}@*.*")):  # this creature's own, from a previous build
        os.remove(old)
    out = {}
    for vid, v in variants.items():
        t = time.time()
        vspec = fn(variant={**v, "id": vid})
        assert len(vspec.body.leaves()) == len(spec.body.leaves()) and len(vspec.parts) == len(spec.parts), \
            f"{spec.key}@{vid}: a variant may change the paint, never the shape (it shares the GLB's mesh and UVs)"
        im = paint.paint_atlas(vspec, tris_arr, size)
        stem = os.path.join(OUT, f"{spec.key}@{vid}")
        entry = {"atlas": f"creatures/{spec.key}@{vid}.ktx2", "bytes": write_map(im["base"], stem + ".ktx2")}
        for kind in ("emit", "mr"):
            if kind in im and (kind not in base_imgs or np.abs(im[kind] - base_imgs[kind]).max() > 2 / 255):
                entry["bytes"] += write_map(im[kind][::2, ::2], f"{stem}_{kind}.ktx2", linear=kind == "mr")
                entry[kind] = f"creatures/{spec.key}@{vid}_{kind}.ktx2"
        out[vid] = entry
        print(f"  variant {vid}: {v['palette']} {v['crusts'] or ''} -> {entry['bytes'] / 1024:.0f} KB ({time.time() - t:.1f}s)")
    return out


def build(spec, fast=False, fn=None, variants=None):
    t0 = time.time()
    print(f"[{spec.key}] plan {spec.plan}, {len(spec.sk)} bones")
    blend.reset()
    pieces = [mesh_piece("body", spec.body, spec.body_voxel * (1.6 if fast else 1.0), spec.body_tris, 0, None, 1.0, spec.uv_angle)]
    for i, p in enumerate(spec.parts):
        pieces.append(mesh_piece(p.name, p.node, p.voxel * (1.4 if fast else 1.0), p.tris, i + 1, p.angle, p.uv_scale, spec.uv_angle))
    lod0 = blend.join(pieces, f"{spec.key}_LOD0")
    blend.pack_uv(lod0)
    lod1 = blend.duplicate(lod0, f"{spec.key}_LOD1")
    print("  lod1 valid:", not lod1.data.validate(verbose=True, clean_customdata=False))
    blend.decimate(lod1, int(blend.tri_count(lod0) * spec.lod1_ratio))
    blend.triangulate(lod1)
    tris0, tris1 = blend.tri_count(lod0), blend.tri_count(lod1)
    skin(spec, lod0)
    skin(spec, lod1)
    t1 = time.time()
    size = spec.atlas // (2 if fast else 1)
    tris_arr = blend.mesh_tris(lod0)
    imgs = paint.paint_atlas(spec, tris_arr, size)
    print(f"  paint {size}^2: coverage {imgs['coverage']:.2f} ({time.time() - t1:.1f}s)")
    os.makedirs(OUT, exist_ok=True)
    vbuilt = paint_variants(spec, fn, variants or {}, tris_arr, size, imgs) if fn else {}
    print(f"  atlas mean {imgs['base'].mean(axis=(0, 1)).round(3)}")
    base = blend.image_from(f"{spec.key}_atlas", imgs["base"], SCRATCH)
    emit = blend.image_from(f"{spec.key}_emit", imgs["emit"][::2, ::2], SCRATCH) if "emit" in imgs else None
    mr = blend.image_from(f"{spec.key}_mr", imgs["mr"][::2, ::2], SCRATCH) if "mr" in imgs else None
    mat = blend.make_material(f"{spec.key}_mat", base, emit, spec.emit_strength, spec.roughness, spec.metallic, mr)
    vparts0 = blend.vertex_parts(lod0)
    for o in (lod0, lod1):
        o.data.materials.clear()
        o.data.materials.append(mat)
        # the part id only steered the build; it must not ride into the file
        at = o.data.attributes.get("part")
        if at:
            o.data.attributes.remove(at)
    arm = blend.make_armature(spec.sk, f"{spec.key}_rig")
    blend.bind(lod0, arm)
    blend.bind(lod1, arm)
    clips = {}
    for cname, c in spec.clips.items():
        clips[cname] = sample_clip(spec.sk, c.fn, c.duration, FPS, c.loop)
    blend.write_clips(arm, clips, FPS)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{spec.key}.glb")
    blend.export_glb(path)
    ktx2.glb_to_ktx2(path, path)  # the atlases as KTX2 (KHR_texture_basisu)
    ftris, _ = glb_facts(path)
    tris0, tris1 = ftris[f"{spec.key}_LOD0"], ftris[f"{spec.key}_LOD1"]
    P = blend.get_verts(lod0)
    vp = vparts0
    lo, hi = P.min(0), P.max(0)
    # what stands on the ground: everything but a carried weapon, which in the
    # rest pose (arms hanging) may reach below the feet
    held = [i + 1 for i, p in enumerate(spec.parts) if ground_clips.is_held(p)]
    body_pts = P if vp is None else P[~np.isin(vp, held)]
    # the ground clamp: lift the root wherever a clip drives the body into the
    # ground (ground_clips.py). It finds the held props in the GLB's own vertex
    # order from the spec's surfaces; check that against the parts Blender knew.
    if held and vp is not None:
        miss = int((ground_clips.held_mask(spec, P) != np.isin(vp, held)).sum())
        if miss:
            print(f"  ground: {miss} of {len(P)} vertices classed held/body against their part")
    # The size is the body's: a spear, scythe or flue carried above the head
    # (or a blowpipe held out) is not what the client scales to the plan's
    # height, nor the footprint the server reaches to. Round 1 measured them
    # with the props, so the rampart's spear drew its body at 0.93 x and the
    # Reaper's scythe had to be kept small (round-2 integration).
    blo, bhi = body_pts.min(0), body_pts.max(0)
    gstats, _ = ground_clips.patch(path, spec=spec, height=float(bhi[1]))
    # then pack the vertex attributes small (quantize.py: int8 normals, uint16
    # UVs, uint8 weights; 28 bytes a vertex instead of 52)
    quantize.patch(path)
    stats = {
        "file": f"creatures/{spec.key}.glb",
        "plan": spec.plan,
        "height": round(float(bhi[1]), 3),         # the body's top above the feet (feet are authored at y = 0), held props left out
        "length": round(float(bhi[2] - blo[2]), 3),  # the body's rest-pose footprint, held props left out
        "width": round(float(bhi[0] - blo[0]), 3),
        "top": round(float(hi[1]), 3),             # the top with held props (a room's ceiling must clear it)
        "minY": round(float(lo[1]), 4),
        "groundY": round(float(body_pts[:, 1].min()), 4),
        "forward": round(float(P[:, 2].max() + P[:, 2].min()) / 2, 3),
        "tris": [tris0, tris1],
        "budget": spec.budget,
        "bones": len(spec.sk),
        "atlas": size,
        "emissive": "emit" in imgs,
        "mr": "mr" in imgs,
        "clips": {k: round(c.duration, 3) for k, c in spec.clips.items()},
        "speeds": {k: round(c.speed, 3) for k, c in spec.clips.items() if c.speed},
        "bytes": os.path.getsize(path),
        "held": gstats["held"],                   # LOD0 vertex ranges of held props (the test reads them)
        "groundLift": gstats["groundLift"],       # {clip: metres the ground clamp lifted it}
        "notes": spec.notes,
        "role": spec.role,
        "variants": vbuilt,
    }
    print(f"  -> {path} {stats['bytes'] / 1024:.0f} KB, tris {tris0}/{tris1}, h {stats['height']} m ({time.time() - t0:.1f}s)")
    return stats


def _plan_files():
    """{plan module ("canine", "uniques/gnarlfang"): path} for every file under plans/."""
    base = os.path.join(HERE, "plans")
    out = {}
    for dp, dn, fn in os.walk(base):
        dn[:] = sorted(d for d in dn if not d.startswith(("__", ".")))
        for f in sorted(fn):
            if f.endswith(".py") and f != "__init__.py":
                out[os.path.relpath(os.path.join(dp, f), base)[:-3].replace(os.sep, "/")] = os.path.join(dp, f)
    return out


def _declared(path):
    """The keys of a plan file's `CREATURES = {"key": ...}`, read from its
    source without importing it: [] when it declares none (a helper such as
    uniques/_household), None when they are not a plain literal (or the file
    does not parse), so only an import can tell."""
    import ast
    try:
        tree = ast.parse(open(path).read())
    except SyntaxError:
        return None
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "CREATURES" for t in node.targets):
            v = node.value
            if isinstance(v, ast.Dict) and all(isinstance(k, ast.Constant) and isinstance(k.value, str) for k in v.keys):
                return [k.value for k in v.keys]
            return None
    return []


def discover(names=(), exact=False):
    """{creature key: (plan module name, spec function)}, importing only the
    plan files the requested names need: the file a name is (unless exact),
    and the files whose CREATURES literal declares it. With no names it imports
    every plan. Several workers edit plans at once (2026-10-13 round 2), so a
    plan that fails to import never breaks a build that does not need it: it
    is reported and skipped. A requested plan that fails still fails."""
    import importlib
    files = _plan_files()
    decl = {m: _declared(p) for m, p in files.items()}
    if names:
        want = set()
        for n in names:
            hit = {m for m, ks in decl.items() if ks and n in ks}
            if not exact:
                hit |= {m for m in files if (m == n or m.split("/")[-1] == n) and decl[m] != []}
            if not hit:  # a name no literal declares: try the plans that build CREATURES some other way
                hit = {m for m, ks in decl.items() if ks is None}
            want |= hit
    else:
        want = {m for m, ks in decl.items() if ks != []}
    found, broken = {}, []
    for name in sorted(want):
        try:
            mod = importlib.import_module("plans." + name.replace("/", "."))
        except Exception as e:  # noqa: BLE001 -- another worker's plan mid-edit
            needed = names and any(n in (decl[name] or []) or (not exact and n in (name, name.split("/")[-1])) for n in names)
            if needed:
                raise
            broken.append(name)
            print(f"  (skipped plans/{name}.py: it does not import: {type(e).__name__}: {e})")
            continue
        for key, fn in getattr(mod, "CREATURES", {}).items():
            assert key not in found, f"creature {key} defined by both {found[key][0]} and {name}"
            found[key] = (name, fn)
    if broken:
        print(f"  {len(broken)} plan file(s) skipped: {broken}")
    return found


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    fast = "--fast" in argv
    # --key: the names are creature keys only ("sentinel" is also a plan file,
    # and without it would rebuild that file's rampart too)
    exact = "--key" in argv
    names = [a for a in argv if not a.startswith("--")]
    found = discover(names, exact)
    plansets = {p for p, _ in found.values()} | {p.split("/")[-1] for p, _ in found.values()}
    keys = [k for k in found if not names or k in names or (not exact and (found[k][0] in names or found[k][0].split("/")[-1] in names))]
    missing = [n for n in names if n not in found and (exact or n not in plansets)]
    assert not missing, f"no creature or plan called {missing}"
    os.makedirs(STATS, exist_ok=True)
    looks_file = os.path.join(ROOT, "client", "src", "creature-looks.json")
    looks = json.load(open(looks_file)) if os.path.exists(looks_file) else {"glbs": {}}
    for k in keys:
        fn = found[k][1]
        stats = build(fn(), fast, fn=fn, variants=looks["glbs"].get(k, {}).get("variants", {}))
        stats["blender"] = __import__("bpy").app.version_string
        stats["planFile"] = f"tools/assets/creatures/plans/{found[k][0]}.py"
        stats["fast"] = fast
        tmp = os.path.join(STATS, f".{k}.json.tmp")
        with open(tmp, "w") as f:
            json.dump(stats, f, indent=1)
            f.write("\n")
        os.replace(tmp, os.path.join(STATS, f"{k}.json"))


if __name__ == "__main__":
    main()
