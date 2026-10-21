"""KTX2 (Basis Universal) textures for the creatures: encode a PNG with basisu,
and swap a GLB's embedded images for KTX2 under KHR_texture_basisu.

    python3 tools/assets/creatures/ktx2.py glb <in.glb> <out.glb>   # every image in the GLB
    python3 tools/assets/creatures/ktx2.py png <in.png|jpg> <out.ktx2>

Plain Python (no Blender); build.py runs it on every GLB and variant map.
ETC1S at quality 255: on the painted atlases it measured within a hair of UASTC
(mean error 2.5 vs 2.1 of 255 on the wolf, the same to the eye) at a third of
the download, about a JPEG's size. On the GPU either becomes ASTC 4x4 (Apple,
WebKit) or BC7 (desktop): a quarter of RGBA8. Images keep their glTF
orientation (top row first), so no flip. Needs basisu 2.x (on PATH, or $BASISU);
the client's decoder is vendored in client/public/ktx2/ (client/src/ktx2.ts).
"""
from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

BASISU = os.environ.get("BASISU") or shutil.which("basisu") or "basisu"


def encode(src, dst, linear=False):
    """PNG -> KTX2 (ETC1S, quality 255, mipmaps)."""
    with tempfile.TemporaryDirectory() as tmp:
        args = [BASISU, "-ktx2", "-q", "255", "-mipmap", "-output_path", tmp, src]
        if linear:
            args.insert(1, "-linear")
        r = subprocess.run(args, capture_output=True, text=True)
        out = os.path.join(tmp, os.path.splitext(os.path.basename(src))[0] + ".ktx2")
        if r.returncode or not os.path.exists(out):
            raise RuntimeError(f"basisu failed on {src}:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
        os.replace(out, dst)
    return os.path.getsize(dst)


def _read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + n])
    bin_len = struct.unpack_from("<I", data, 20 + n)[0]
    b = data[20 + n + 8:20 + n + 8 + bin_len]
    return j, b


def _write_glb(path, j, b):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    b += b"\0" * ((4 - len(b) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(b)
    with open(path + ".tmp", "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(b), 0x004E4942) + b)
    os.replace(path + ".tmp", path)


def glb_to_ktx2(src, dst):
    """Re-encode every image of a GLB as KTX2 and mark its textures
    KHR_texture_basisu. Base colour and emissive are sRGB; a metal-rough map is
    linear (found from the materials)."""
    j, b = _read_glb(src)
    linear = set()
    for m in j.get("materials", []):
        mr = m.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture")
        if mr:
            linear.add(j["textures"][mr["index"]]["source"])
    new_bin = bytearray()
    views = []
    image_view = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i, im in enumerate(j["images"]):
            v = j["bufferViews"][im["bufferView"]]
            raw = b[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
            ext = ".png" if im.get("mimeType") == "image/png" else ".jpg"
            p = os.path.join(tmp, f"img{i}{ext}")
            with open(p, "wb") as f:
                f.write(raw)
            k = os.path.join(tmp, f"img{i}.ktx2")
            encode(p, k, linear=i in linear)
            with open(k, "rb") as f:
                image_view[i] = f.read()
    # rebuild the buffer: every non-image view as it was, then the new images
    image_views = {im["bufferView"] for im in j["images"]}
    remap = {}
    for vi, v in enumerate(j["bufferViews"]):
        if vi in image_views:
            continue
        while len(new_bin) % 4:
            new_bin.append(0)
        off = len(new_bin)
        new_bin += b[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        nv = dict(v)
        nv["byteOffset"] = off
        remap[vi] = len(views)
        views.append(nv)
    for i, im in enumerate(j["images"]):
        while len(new_bin) % 4:
            new_bin.append(0)
        off = len(new_bin)
        new_bin += image_view[i]
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(image_view[i])})
        im["bufferView"] = len(views) - 1
        im["mimeType"] = "image/ktx2"
        im.pop("uri", None)
    for a in j.get("accessors", []):
        if "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    j["bufferViews"] = views
    j["buffers"] = [{"byteLength": len(new_bin)}]
    for t in j.get("textures", []):
        src_i = t.pop("source")
        t.setdefault("extensions", {})["KHR_texture_basisu"] = {"source": src_i}
    for key in ("extensionsUsed", "extensionsRequired"):
        j.setdefault(key, [])
        if "KHR_texture_basisu" not in j[key]:
            j[key].append("KHR_texture_basisu")
    _write_glb(dst, j, bytes(new_bin))
    return os.path.getsize(dst)


if __name__ == "__main__":
    mode, a, b_ = sys.argv[1:4]
    n = glb_to_ktx2(a, b_) if mode == "glb" else encode(a, b_)
    print(f"{b_}: {n / 1024:.0f} KB")
