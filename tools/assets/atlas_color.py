# What colour is a Kenney kit piece REALLY?
#
# Kenney's kits UV-map every model onto one shared `colormap` atlas of flat
# swatches. Two pieces that both look like "stone" in the preview can land on
# completely different swatches, and a tint MULTIPLIES whatever is there -- so
# aiming a grey tint at a piece whose atlas region is red gives you a dark red
# pillar, not a grey one. That is how the Hush's chapel came out with red
# columns and the fen's shrine came out banded.
#
# This reads each model's UVs, samples the atlas at those coordinates, and
# reports the dominant colours actually used. Pick pieces whose swatches are
# already the family you want, and reserve tints for nudging.
#
# Usage:  python3 tools/assets/atlas_color.py client/public/models/graveyard
#
# The Quaternius village kit (.gltf, client/public/models/town) is the other
# case: no shared atlas, but one base-colour sheet PER MATERIAL, and a piece
# like Wall_UnevenBrick_Straight is three materials (stone, plaster, wood
# trim). Its UVs wrap and its vertices sit only at the corners of big quads,
# so the swatch count above means nothing there; instead each material is
# sampled area-weighted across its own triangles and reported as a MEAN plus
# its share of the piece. `--sheet MAT=file` swaps a sheet the way a town.ts
# palette does, so a recoloured sheet is measured on the pieces that wear it
# before anyone renders it:
#
#   python3 tools/assets/atlas_color.py client/public/models/town/Roof_RoundTiles_6x8.gltf \
#       --sheet MI_RoundTiles=T_RoundTiles_BaseColor_slate.jpg

import json, os, struct, sys
from collections import Counter
from PIL import Image

def load_glb(path):
    blob = open(path, "rb").read()
    off, chunks = 12, {}
    while off < len(blob):
        ln, kind = struct.unpack_from("<II", blob, off)
        chunks[kind] = blob[off + 8: off + 8 + ln]
        off += 8 + ln + (-ln % 4)
    return json.loads(chunks[0x4E4F534A]), chunks.get(0x004E4942, b"")

COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

def read_accessor(d, buf, i):
    acc = d["accessors"][i]
    bv = d["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = COMP[acc["componentType"]]
    n = NUM[acc["type"]]
    size = struct.calcsize(fmt) * n
    stride = bv.get("byteStride") or size
    out = []
    for k in range(acc["count"]):
        out.append(struct.unpack_from("<" + fmt * n, buf, base + k * stride))
    return out

def tri_area(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    return 0.5 * ((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2) ** 0.5

def gltf_report(path, sheets, n_samples=5000):
    # one mean per material, sampled over the SURFACE (area-weighted, at
    # random barycentric points, UVs wrapped) rather than at the vertices
    import random
    d = json.load(open(path))
    base = os.path.dirname(path)
    buf = open(os.path.join(base, d["buffers"][0]["uri"]), "rb").read()
    rng = random.Random(1)
    cache, total = {}, 0.0
    per = {}
    for mesh in d.get("meshes", []):
        for prim in mesh.get("primitives", []):
            mi = prim.get("material")
            if mi is None or "TEXCOORD_0" not in prim.get("attributes", {}):
                continue
            m = d["materials"][mi]
            pbr = m.get("pbrMetallicRoughness", {})
            pos = read_accessor(d, buf, prim["attributes"]["POSITION"])
            uv = read_accessor(d, buf, prim["attributes"]["TEXCOORD_0"])
            idx = [i[0] for i in read_accessor(d, buf, prim["indices"])] if "indices" in prim else list(range(len(pos)))
            tris = [(idx[k], idx[k + 1], idx[k + 2]) for k in range(0, len(idx) - 2, 3)]
            areas = [tri_area(pos[a], pos[b], pos[c]) for a, b, c in tris]
            area = sum(areas)
            total += area
            ent = per.setdefault(m["name"], {"area": 0.0, "sum": [0.0, 0.0, 0.0], "n": 0, "sheet": None})
            ent["area"] += area
            bct = pbr.get("baseColorTexture")
            if bct is None or area <= 0:
                f = pbr.get("baseColorFactor", [1, 1, 1, 1])
                ent["flat"] = "#%02x%02x%02x" % tuple(int(255 * v) for v in f[:3])
                continue
            uri = d["images"][d["textures"][bct["index"]]["source"]]["uri"]
            uri = sheets.get(m["name"], uri)
            ent["sheet"] = uri
            if uri not in cache:
                cache[uri] = Image.open(os.path.join(base, uri)).convert("RGB")
            im = cache[uri]
            W, H = im.size
            px = im.load()
            for (a, b, c) in rng.choices(tris, weights=areas, k=n_samples):
                r1, r2 = rng.random(), rng.random()
                if r1 + r2 > 1:
                    r1, r2 = 1 - r1, 1 - r2
                u = uv[a][0] + r1 * (uv[b][0] - uv[a][0]) + r2 * (uv[c][0] - uv[a][0])
                v = uv[a][1] + r1 * (uv[b][1] - uv[a][1]) + r2 * (uv[c][1] - uv[a][1])
                p = px[int((u % 1.0) * W) % W, int((v % 1.0) * H) % H]
                for ch in range(3):
                    ent["sum"][ch] += p[ch]
                ent["n"] += 1
    parts = []
    for name, e in sorted(per.items(), key=lambda kv: -kv[1]["area"]):
        share = round(100 * e["area"] / max(total, 1e-9))
        col = e.get("flat") or ("#%02x%02x%02x" % tuple(int(v / max(1, e["n"])) for v in e["sum"]))
        parts.append(f"{name} {col} {share}%" + (f" ({e['sheet']})" if e["sheet"] in sheets.values() else ""))
    print(f"{os.path.basename(path):34} " + "  ".join(parts))

def main(target, sheets=None):
    sheets = sheets or {}
    if os.path.isdir(target):
        files = [os.path.join(target, f) for f in sorted(os.listdir(target)) if f.endswith(".glb") or f.endswith(".gltf")]
    else:
        files = [target]
    for path in [f for f in files if f.endswith(".gltf")]:
        gltf_report(path, sheets)
    files = [f for f in files if f.endswith(".glb")]
    atlas_cache = {}
    for path in files:
        d, buf = load_glb(path)
        # the atlas is embedded or sits next to the model
        img = None
        for im in d.get("images", []):
            uri = im.get("uri")
            if uri and not uri.startswith("data:"):
                cand = os.path.join(os.path.dirname(path), uri)
                if os.path.exists(cand):
                    img = cand
            elif im.get("bufferView") is not None:
                bv = d["bufferViews"][im["bufferView"]]
                img = ("embedded", bv.get("byteOffset", 0), bv["byteLength"])
        # fall back to the kit's shared Textures/colormap.png
        if img is None or isinstance(img, tuple):
            cand = os.path.join(os.path.dirname(path), "Textures", "colormap.png")
            img = cand if os.path.exists(cand) else img
        if isinstance(img, str):
            if img not in atlas_cache:
                atlas_cache[img] = Image.open(img).convert("RGB")
            atlas = atlas_cache[img]
        else:
            print(f"{os.path.basename(path):28} (no atlas found)")
            continue
        W, H = atlas.size
        counts = Counter()
        for mesh in d.get("meshes", []):
            for prim in mesh.get("primitives", []):
                uvi = prim.get("attributes", {}).get("TEXCOORD_0")
                if uvi is None:
                    continue
                for (u, v) in read_accessor(d, buf, uvi):
                    px = atlas.getpixel((min(W - 1, max(0, int(u * W))), min(H - 1, max(0, int(v * H)))))
                    counts[px] += 1
        if not counts:
            print(f"{os.path.basename(path):28} (no UVs)")
            continue
        top = counts.most_common(4)
        tot = sum(counts.values())
        desc = "  ".join("#%02x%02x%02x %2d%%" % (c[0], c[1], c[2], round(n * 100 / tot)) for c, n in top)
        print(f"{os.path.basename(path):28} {desc}")

if __name__ == "__main__":
    args, sheets, i = sys.argv[1:], {}, 0
    while "--sheet" in args:
        i = args.index("--sheet")
        k, v = args[i + 1].split("=", 1)
        sheets[k] = v
        del args[i:i + 2]
    for t in args:
        main(t, sheets)
