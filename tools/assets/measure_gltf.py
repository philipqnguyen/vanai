# World-space size report for glTF/GLB models, without Blender.
#
# Why this exists: reading POSITION accessor min/max alone is the trap
# CC0-ASSETS.md opens with. Quaternius and Kenney exports routinely carry a
# node scale (0.01 is common), and staticTemplate bakes the full node chain, so
# the size the GAME sees is the accessor bounds pushed through every parent
# transform. Measuring the accessor alone reports such a model 100 times too
# big. This walks the node graph and reports what the game will actually get.
#
# Usage:  python3 tools/assets/measure_gltf.py <file-or-dir> [...]
#         python3 tools/assets/measure_gltf.py client/public/models/props --json

import base64, json, os, struct, sys

def _mat_mul(a, b):
    # column-major 4x4, glTF convention
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
            for c in range(4) for r in range(4)]

def _trs(node):
    if "matrix" in node:
        return list(node["matrix"])
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = r
    rm = [
        1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
        2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
        0, 0, 0, 1,
    ]
    for c in range(3):
        for r2 in range(3):
            rm[c * 4 + r2] *= s[c]
    rm[12], rm[13], rm[14] = t
    return rm

def _xform(m, p):
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]

def _load(path):
    if path.lower().endswith(".glb"):
        blob = open(path, "rb").read()
        assert blob[:4] == b"glTF", path
        off, chunks = 12, {}
        while off < len(blob):
            ln, kind = struct.unpack_from("<II", blob, off)
            chunks[kind] = blob[off + 8: off + 8 + ln]
            off += 8 + ln + (-ln % 4)
        return json.loads(chunks[0x4E4F534A]), {None: chunks.get(0x004E4942, b"")}
    d = json.load(open(path))
    bufs = {}
    for i, b in enumerate(d.get("buffers", [])):
        uri = b.get("uri", "")
        if uri.startswith("data:"):
            bufs[i] = base64.b64decode(uri.split(",", 1)[1])
        elif uri:
            bufs[i] = open(os.path.join(os.path.dirname(path), uri), "rb").read()
    return d, bufs

def measure(path):
    d, bufs = _load(path)
    glb = None in bufs

    # accessor min/max is authored per-primitive and is enough for a bbox: the
    # 8 corners of the local box, pushed through the node chain, bound the mesh.
    def mesh_corners(mi):
        pts = []
        for prim in d["meshes"][mi].get("primitives", []):
            ai = prim.get("attributes", {}).get("POSITION")
            if ai is None:
                continue
            acc = d["accessors"][ai]
            mn, mx = acc.get("min"), acc.get("max")
            if not mn or not mx:
                continue
            for cx in (mn[0], mx[0]):
                for cy in (mn[1], mx[1]):
                    for cz in (mn[2], mx[2]):
                        pts.append([cx, cy, cz])
        return pts

    world = []
    verts = [0, 0]

    def walk(ni, parent):
        node = d["nodes"][ni]
        m = _mat_mul(parent, _trs(node))
        if "mesh" in node:
            for p in mesh_corners(node["mesh"]):
                world.append(_xform(m, p))
            for prim in d["meshes"][node["mesh"]].get("primitives", []):
                ai = prim.get("attributes", {}).get("POSITION")
                if ai is not None:
                    verts[0] += d["accessors"][ai]["count"]
            verts[1] += 1
        for c in node.get("children", []):
            walk(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    roots = d["scenes"][d.get("scene", 0)]["nodes"] if d.get("scenes") else range(len(d.get("nodes", [])))
    for r in roots:
        walk(r, ident)
    if not world:
        return None
    mn = [min(p[i] for p in world) for i in range(3)]
    mx = [max(p[i] for p in world) for i in range(3)]
    return {
        "file": os.path.basename(path),
        "size": [round(mx[i] - mn[i], 3) for i in range(3)],
        # full bounds, not just min_y: a manifest consumer needs to know where
        # the origin sits inside the box to place a piece without a yOff guess.
        "min": [round(mn[i], 3) for i in range(3)],
        "max": [round(mx[i], 3) for i in range(3)],
        "min_y": round(mn[1], 3),
        "verts": verts[0],
        "prims": verts[1],
        "mats": [m.get("name") for m in d.get("materials", [])],
        "glb": bool(glb),
    }

def main(args):
    as_json = "--json" in args
    targets = [a for a in args if not a.startswith("--")]
    files = []
    for t in targets:
        if os.path.isdir(t):
            files += [os.path.join(t, f) for f in sorted(os.listdir(t))
                      if f.lower().endswith((".gltf", ".glb"))]
        else:
            files.append(t)
    rows = []
    for f in files:
        try:
            r = measure(f)
        except Exception as e:
            r = {"file": os.path.basename(f), "error": str(e)}
        if r:
            rows.append(r)
    if as_json:
        print(json.dumps(rows, indent=1))
        return
    for r in rows:
        if "error" in r:
            print(f"{r['file']:34} ERROR {r['error']}")
            continue
        w, h, dp = r["size"]
        print(f"{r['file']:34} h={h:8.3f}  w={w:7.3f} d={dp:7.3f}  y0={r['min_y']:7.3f}  "
              f"v={r['verts']:6d}  {','.join(m or '' for m in r['mats'])[:44]}")

if __name__ == "__main__":
    main(sys.argv[1:])
