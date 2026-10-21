# Measured catalogue of the CC0 model dirs -> client/src/env_manifest_cc0.json
#
# Why this exists: without a catalogue every placement in the CC0 dirs was a
# guess followed by a screenshot, which is exactly the loop CC0-ASSETS.md
# records as the most expensive part of the Greywold pass ("3x gave a
# half-metre wardlight where 7x was needed").
#
# Two things are recorded, because two different assumptions kept being wrong:
#
#   SIZE, in world space. Delegated to measure_gltf.measure(), which walks the
#   node chain -- the accessor bounds alone are off by a factor of 100 when a
#   node scale of 0.01 is baked, and staticTemplate bakes the same chain. Do not reimplement this; there is one node-walk on purpose.
#
#   COLOUR, sampled through the UVs. Averaging a sheet is right for a painted
#   per-species texture and badly wrong for a shared atlas: Kenney UV-maps
#   every graveyard piece onto one colormap.png of flat swatches, so the mean
#   of the SHEET says nothing about the mean of the PIECE. Sampling at the
#   model's own UVs collapses to the sheet average when the sheet is dedicated
#   and stays correct when it is an atlas, so there is one code path.
#
# Alpha matters here: the leaf sheets are cutouts, and counting the
# transparent texels drags a canopy's colour toward black. Masked texels are
# skipped, which is what makes `Leaves_Birch_C` come back as the autumn orange
# CC0-ASSETS.md warns about rather than a muddy brown.
#
# Run:    python3 tools/assets/gen_cc0_manifest.py
#         python3 tools/assets/gen_cc0_manifest.py --check   (ground truth only)

import io
import json
import os
import re
import struct
import sys
from collections import defaultdict

from PIL import Image

from measure_gltf import _load, measure

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(REPO, "client", "public", "models")
OUT = os.path.join(REPO, "client", "src", "env_manifest_cc0.json")

# The CC0 dirs. "" is the models/ root itself, scanned one level deep so it
# does not descend into the generated dirs.
ROOTS = ["", "crystal", "graveyard", "pirate", "props", "town", "dungeon", "hex", "halloween"]

# Mirrors the __paintedArt regex in models.ts. Recorded rather than recomputed
# by eye because the flag decides whether tintInstances and styleFoliage repaint
# a pack, and the two lists drifting apart is how a painted kit gets crushed.
PAINTED = ("graveyard/", "crystal/", "props/", "town/", "dungeon/", "hex/", "halloween/")

# Measured facts already in CC0-ASSETS.md, kept as a self-test: if the
# script disagrees with the numbers the Greywold pass measured, the script is
# wrong. (key, axis, expected metres) Only models still on disk: a carried-over
# row (keep_retired) would test nothing.
GROUND_TRUTH = [
    ("graveyard/pillar-obelisk.glb", 1, 1.01),
    ("graveyard/gravestone-bevel.glb", 1, 0.53),
    ("graveyard/fire-basket.glb", 1, 0.17),
]

COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
# Normalized integer UVs are legal glTF and Quaternius exports use them.
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}

MAX_SAMPLES = 3000  # per primitive; these sheets are flat, more adds nothing


def read_accessor(d, bufs, i):
    acc = d["accessors"][i]
    if "bufferView" not in acc:
        return []
    bv = d["bufferViews"][acc["bufferView"]]
    buf = bufs.get(bv.get("buffer", 0) if None not in bufs else None)
    if buf is None:
        return []
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = COMP[acc["componentType"]]
    n = NUM[acc["type"]]
    stride = bv.get("byteStride") or struct.calcsize(fmt) * n
    scale = NORM.get(acc["componentType"]) if acc.get("normalized") else None
    out = []
    for k in range(acc["count"]):
        v = struct.unpack_from("<" + fmt * n, buf, base + k * stride)
        out.append(tuple(c / scale for c in v) if scale else v)
    return out


def sample_points(d, bufs, prim, uvs):
    """UVs to sample a primitive at: triangle centroids, not vertices.

    MEASURED, and the reason this function exists: sampling at vertex UVs
    returned NOTHING for every leaf material in the pack. A leaf card is a quad
    whose four vertices sit on the CORNERS of its cutout island, which is the
    one part of the sheet that is fully transparent -- so every sample was
    masked away and a birch canopy came back colourless. The centroid of each
    triangle lands inside the leaf instead. Solid kit geometry is unaffected:
    the centroid of a triangle inside a flat Kenney swatch is the same swatch.
    """
    ii = prim.get("indices")
    if ii is None or prim.get("mode", 4) != 4:
        return uvs  # non-indexed or not triangles: vertices are all there is
    idx = [v[0] for v in read_accessor(d, bufs, ii)]
    tris = len(idx) // 3
    if not tris:
        return uvs
    step = max(1, tris // MAX_SAMPLES)
    pts = []
    for t in range(0, tris, step):
        a, b, c = idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]
        if a >= len(uvs) or b >= len(uvs) or c >= len(uvs):
            continue
        pts.append(((uvs[a][0] + uvs[b][0] + uvs[c][0]) / 3.0,
                    (uvs[a][1] + uvs[b][1] + uvs[c][1]) / 3.0))
    return pts


def load_image(d, bufs, path, image_index, cache):
    """Resolve a glTF image to a PIL RGBA image, external or embedded."""
    img = d["images"][image_index]
    uri = img.get("uri")
    if uri and not uri.startswith("data:"):
        p = os.path.join(os.path.dirname(path), uri)
        if not os.path.exists(p):
            return None
        if p not in cache:
            cache[p] = Image.open(p).convert("RGBA")
        return cache[p]
    if img.get("bufferView") is not None:
        bv = d["bufferViews"][img["bufferView"]]
        buf = bufs.get(bv.get("buffer", 0) if None not in bufs else None)
        if buf is None:
            return None
        off = bv.get("byteOffset", 0)
        blob = buf[off:off + bv["byteLength"]]
        key = (path, image_index)
        if key not in cache:
            cache[key] = Image.open(io.BytesIO(blob)).convert("RGBA")
        return cache[key]
    return None


def base_color_image(d, mat):
    """The image index behind a material's base colour texture, if any."""
    pbr = mat.get("pbrMetallicRoughness", {})
    tex = pbr.get("baseColorTexture")
    if not tex:
        return None, None
    t = d["textures"][tex["index"]]
    src = t.get("source")
    if src is None:
        return None, None
    xform = tex.get("extensions", {}).get("KHR_texture_transform", {})
    return src, xform


def sample_material(d, bufs, path, mat_index, uvs, cache):
    """UV-weighted colour buckets for one material, as {bucket: [n, r, g, b]}."""
    mat = d.get("materials", [])[mat_index] if mat_index is not None else {}
    pbr = mat.get("pbrMetallicRoughness", {})
    factor = pbr.get("baseColorFactor")
    src, xform = base_color_image(d, mat)
    buckets = defaultdict(lambda: [0, 0, 0, 0])

    if src is None:
        # Untextured: the material factor IS the colour. Common in the root
        # Quaternius .glb set, where Rock carries no sheet at all.
        if not factor:
            return buckets, False
        r, g, b = (int(round(min(1.0, max(0.0, c)) * 255)) for c in factor[:3])
        buckets[(r >> 4, g >> 4, b >> 4)] = [1, r, g, b]
        return buckets, False

    im = load_image(d, bufs, path, src, cache)
    if im is None or not uvs:
        return buckets, False
    px = im.load()
    W, H = im.size
    off = xform.get("offset", [0.0, 0.0]) if xform else [0.0, 0.0]
    sc = xform.get("scale", [1.0, 1.0]) if xform else [1.0, 1.0]
    # The asset states its own cutoff (0.2 on this pack's leaves); overriding it
    # with a blanket 128 discards texels the game actually draws.
    thr = (int(mat.get("alphaCutoff", 0.5) * 255)
           if mat.get("alphaMode") == "MASK" else 128)
    masked = False

    for uv in uvs:
        if len(uv) < 2:
            continue
        u = uv[0] * sc[0] + off[0]
        v = uv[1] * sc[1] + off[1]
        x = min(W - 1, max(0, int(u * W)))
        y = min(H - 1, max(0, int(v * H)))
        r, g, b, a = px[x, y]
        # Skip cut-out texels. Without this a leaf card reads as the average of
        # its leaves AND the transparent gaps between them, i.e. too dark.
        if a <= 0 or a < thr:
            masked = True
            continue
        if factor:
            r = int(r * factor[0])
            g = int(g * factor[1])
            b = int(b * factor[2])
        bk = buckets[(r >> 4, g >> 4, b >> 4)]
        bk[0] += 1
        bk[1] += r
        bk[2] += g
        bk[3] += b
    return buckets, masked


def hexof(r, g, b):
    return "#%02x%02x%02x" % (int(r), int(g), int(b))


def colors_of(path, cache):
    """Per-material and overall colour for one model."""
    d, bufs = _load(path)
    mats = d.get("materials", [])
    per_mat = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    cutouts = set()

    for mesh in d.get("meshes", []):
        for prim in mesh.get("primitives", []):
            mi = prim.get("material")
            uvi = prim.get("attributes", {}).get("TEXCOORD_0")
            uvs = read_accessor(d, bufs, uvi) if uvi is not None else []
            uvs = sample_points(d, bufs, prim, uvs) if uvs else uvs
            buckets, masked = sample_material(d, bufs, path, mi, uvs, cache)
            if masked:
                cutouts.add(mi)
            for k, v in buckets.items():
                dst = per_mat[mi][k]
                for j in range(4):
                    dst[j] += v[j]

    out_mats = []
    total = defaultdict(lambda: [0, 0, 0, 0])
    for mi, buckets in sorted(per_mat.items(), key=lambda kv: (kv[0] is None, kv[0])):
        n = sum(b[0] for b in buckets.values())
        if not n:
            continue
        for k, v in buckets.items():
            dst = total[k]
            for j in range(4):
                dst[j] += v[j]
        top = sorted(buckets.values(), key=lambda b: -b[0])[:3]
        name = mats[mi].get("name") if mi is not None and mi < len(mats) else None
        out_mats.append({
            "name": name,
            "color": hexof(sum(b[1] for b in buckets.values()) / n,
                           sum(b[2] for b in buckets.values()) / n,
                           sum(b[3] for b in buckets.values()) / n),
            "swatches": [
                {"color": hexof(b[1] / b[0], b[2] / b[0], b[3] / b[0]),
                 "share": round(b[0] / n, 3)}
                for b in top
            ],
            "cutout": mi in cutouts,
        })

    n = sum(b[0] for b in total.values())
    overall = hexof(sum(b[1] for b in total.values()) / n,
                    sum(b[2] for b in total.values()) / n,
                    sum(b[3] for b in total.values()) / n) if n else None
    return overall, out_mats


def find_models():
    """Every CC0 model, keyed by the path staticTemplate() takes."""
    found = []
    for root in ROOTS:
        base = os.path.join(MODELS, root) if root else MODELS
        if not os.path.isdir(base):
            continue
        if root == "":
            # models/ root only; the subdirs are listed in ROOTS
            for f in sorted(os.listdir(base)):
                if f.lower().endswith((".gltf", ".glb")):
                    found.append((f, os.path.join(base, f)))
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames.sort()
            for f in sorted(filenames):
                if not f.lower().endswith((".gltf", ".glb")):
                    continue
                full = os.path.join(dirpath, f)
                key = os.path.relpath(full, MODELS).replace(os.sep, "/")
                found.append((key, full))
    return found


def build():
    cache = {}
    manifest = {}
    errors = []
    for key, path in find_models():
        try:
            m = measure(path)
        except Exception as e:  # a malformed export should not kill the run
            errors.append((key, f"measure: {e}"))
            continue
        if not m:
            errors.append((key, "no geometry"))
            continue
        entry = {
            "size": m["size"],
            "min": m["min"],
            "max": m["max"],
            "verts": m["verts"],
            "prims": m["prims"],
            "painted": key.startswith(PAINTED),
        }
        try:
            overall, mats = colors_of(path, cache)
            if overall:
                entry["color"] = overall
            if mats:
                entry["materials"] = mats
        except Exception as e:
            errors.append((key, f"color: {e}"))
        manifest[key] = entry
    return manifest, errors


# The CC0 props the dungeons replaced with originals (DUNGEON-PROPS.md) are
# deleted from disk, but the dungeon modules still place their paths as swap
# keys, and build_dungeon_props.mjs and dungeon_props.test.mjs read each key's
# measured bounds here. So are the Quaternius nature kit's files (2026-10-18):
# the generated trees and nature (trees.ts KIT, nature.ts NATURE_KIT) stand in
# under the kit's paths and are built to these rows' sizes and swatches. A
# rebuild from disk would drop them, so an entry whose file is gone is carried
# over from the old manifest while dprops-index.json swaps it, props-nature.ts
# fits a generated tree to it, or a generated stand-in is keyed by it.
SWAP_INDEX = os.path.join(REPO, "client", "src", "dungeon-kit", "dprops-index.json")
PROPS_NATURE = os.path.join(REPO, "client", "src", "dungeon-kit", "props-nature.ts")
TREES = os.path.join(REPO, "client", "src", "trees.ts")
NATURE = os.path.join(REPO, "client", "src", "nature.ts")


def generated_keys():
    """The kit paths the generated trees and nature are keyed by."""
    keys = set()
    if os.path.exists(TREES):
        with open(TREES) as fh:
            # kit("CommonTree", BROADLEAF, [[h, w], ...], seed) -> nature/CommonTree_1..n.gltf
            for prefix, rows in re.findall(r'kit\("(\w+)", \w+, \[(.*?)\], \d+\);', fh.read()):
                keys |= {f"nature/{prefix}_{i + 1}.gltf" for i in range(rows.count("["))}
    if os.path.exists(NATURE):
        with open(NATURE) as fh:
            keys |= set(re.findall(r'^  "([^"]+)": \["', fh.read(), re.M))
    return keys


def keep_retired(manifest):
    if not os.path.exists(OUT):
        return []
    with open(OUT) as fh:
        old = json.load(fh)
    keys = set()
    if os.path.exists(SWAP_INDEX):
        with open(SWAP_INDEX) as fh:
            keys |= set(json.load(fh).get("swap", {}))
    if os.path.exists(PROPS_NATURE):
        with open(PROPS_NATURE) as fh:
            keys |= set(re.findall(r"'([^']+\.(?:glb|gltf))': \{ as:", fh.read()))
    keys |= generated_keys()
    kept = sorted(k for k in keys if k in old and k not in manifest)
    for k in kept:
        manifest[k] = old[k]
    return kept


def check(manifest):
    ok = True
    for key, axis, expected in GROUND_TRUTH:
        got = manifest.get(key, {}).get("size", [None, None, None])[axis]
        good = got is not None and abs(got - expected) <= 0.011
        ok = ok and good
        print(f"  {'ok  ' if good else 'FAIL'} {key:42} {got} vs {expected} (doc)")
    return ok


def main(argv):
    manifest, errors = build()
    print(f"{len(manifest)} models measured across {len(ROOTS)} CC0 roots")
    kept = keep_retired(manifest)
    if kept:
        print(f"{len(kept)} retired keys kept from the old manifest (their files are deleted)")
    for key, err in errors:
        print(f"  skipped {key}: {err}")
    print("ground truth from CC0-ASSETS.md:")
    ok = check(manifest)
    if "--check" in argv:
        return 0 if ok else 1
    if not ok:
        print("ground-truth check failed; manifest NOT written")
        return 1
    with open(OUT, "w") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"wrote {os.path.relpath(OUT, REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
