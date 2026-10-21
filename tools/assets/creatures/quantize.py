"""Pack a creature GLB's vertex attributes small (KHR_mesh_quantization). Pure numpy.

    python3 tools/assets/creatures/quantize.py client/public/models/creatures/<key>.glb [...]
    python3 tools/assets/creatures/quantize.py --check client/public/models/creatures/*.glb

Blender writes every attribute as float32: 52 bytes a vertex. Round 2's perf
gate found the mesh was about 60-70% of every creature's file (the Burned
Land's four 1024² uniques were 1.4-1.5 MB each, 1.0 MB of it mesh), so its
download and heap stayed above the old KayKit set's. This packs, losslessly to
the eye:

  NORMAL      float32 x3 -> int8 x3 normalized, 4-byte stride (0.5 degree)
  TEXCOORD_0  float32 x2 -> uint16 x2 normalized (1/65535 of the atlas)
  WEIGHTS_0   float32 x4 -> uint8 x4 normalized, each vertex summing to
              exactly 255 (largest remainder), its strongest joint kept

28 bytes a vertex instead of 52. It also drops the animation channels that
only hold a bone at rest (trim_channels), most of every clip's channels. POSITION stays float32: a skinned mesh's
node transform is ignored, so quantized positions would have to fold their
scale into the inverse binds; not worth it. TEXCOORD_0 and WEIGHTS_0 packed
this way are core glTF; int8 normals need the extension, which Babylon's
loader implements (it is listed as required).

It runs at the end of every build (build.py, after the ground clamp) and on
built files in place. A packed file is left alone, so running it twice
changes nothing. It updates `bytes` in client/src/creatures/<key>.json.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ground_clips import Glb, Rigged, STATS  # noqa: E402

EXT = "KHR_mesh_quantization"


def _add_view(glb, data: bytes, stride=None):
    vi = len(glb.json["bufferViews"])
    v = {"buffer": 0, "byteOffset": -1, "byteLength": len(data), "target": 34962}
    if stride:
        v["byteStride"] = stride
    glb.json["bufferViews"].append(v)
    glb.extra.append((vi, data))
    return vi


def _normals(N):
    n = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    q = np.clip(np.round(n * 127), -127, 127).astype("<i1")
    padded = np.zeros((len(q), 4), "<i1")
    padded[:, :3] = q
    return padded.tobytes()


def _uvs(U):
    assert U.min() >= -1e-4 and U.max() <= 1 + 1e-4, f"UVs {U.min():.4f}..{U.max():.4f} leave the atlas"
    return np.clip(np.round(U * 65535), 0, 65535).astype("<u2").tobytes()


def _weights(W):
    W = np.clip(W, 0, None)
    s = W.sum(1, keepdims=True)
    W = np.where(s > 0, W / np.maximum(s, 1e-12), np.array([[1.0, 0, 0, 0]]))
    raw = W * 255
    q = np.floor(raw).astype(int)
    short = 255 - q.sum(1)
    order = np.argsort(-(raw - q), axis=1)  # the largest remainders take what is short
    for k in range(4):
        add = short > k
        q[np.arange(len(q))[add], order[add, k]] += 1
    assert (q.sum(1) == 255).all()
    return q.astype("<u1").tobytes()


def packed(glb: Glb) -> bool:
    return EXT in glb.json.get("extensionsUsed", [])


def quantize(glb: Glb) -> bool:
    """Pack in memory; True if anything changed (save() writes it)."""
    if packed(glb):
        return False
    j = glb.json
    done = {}
    for m in j["meshes"]:
        for p in m["primitives"]:
            at = p["attributes"]
            for name, enc, ctype, typ, stride in (("NORMAL", _normals, 5120, "VEC3", 4),
                                                   ("TEXCOORD_0", _uvs, 5123, "VEC2", None),
                                                   ("WEIGHTS_0", _weights, 5121, "VEC4", None)):
                if name not in at:
                    continue
                old = at[name]
                if old in done:
                    at[name] = done[old]
                    continue
                a = j["accessors"][old]
                if a["componentType"] != 5126:
                    continue
                vals = glb.acc(old)
                vi = _add_view(glb, enc(vals), stride)
                na = {"bufferView": vi, "componentType": ctype, "count": a["count"], "type": typ, "normalized": True}
                j["accessors"].append(na)
                done[old] = at[name] = len(j["accessors"]) - 1
    for key in ("extensionsUsed", "extensionsRequired"):
        lst = j.setdefault(key, [])
        if EXT not in lst:
            lst.append(EXT)
    return True


def _same(path, a, b):
    if path == "rotation":
        return abs(abs(float(np.dot(a, b))) - 1.0) < 1e-7
    return float(np.abs(a - b).max()) < 1e-5


def trim_channels(glb: Glb) -> int:
    """Drop every animation channel that holds its node at its rest value in
    every clip that has it: about two thirds of them (each bone's translation
    and scale, and the bones a creature never turns). The node then simply
    stays at rest, which is what the channel said; a channel that moves in
    any clip is kept in every clip, so switching clips never strands a bone.
    Each kept channel is one TargetedAnimation per clip per monster in the
    scene, and the Burned Land's 78 monsters carried ~34,000 of them."""
    rg = Rigged(glb)
    rest_ok = {}
    for an in glb.json.get("animations", []):
        for c in an["channels"]:
            tgt = c["target"]
            if "node" not in tgt or tgt["path"] not in ("translation", "rotation", "scale"):
                continue
            n, p = tgt["node"], tgt["path"]
            v = glb.acc(an["samplers"][c["sampler"]]["output"])
            t0, r0, s0 = rg.rest(n)
            rest = {"translation": t0, "rotation": r0, "scale": s0}[p]
            ok = all(_same(p, row, rest) for row in v)
            rest_ok[(n, p)] = rest_ok.get((n, p), True) and ok
    drop = {k for k, ok in rest_ok.items() if ok}
    if not drop:
        return 0
    gone = 0
    for an in glb.json["animations"]:
        keep = [c for c in an["channels"] if (c["target"].get("node"), c["target"].get("path")) not in drop]
        gone += len(an["channels"]) - len(keep)
        an["channels"] = keep
    return gone   # save() drops the samplers and accessors no channel names


def patch(path, stats=None):
    glb = Glb(path)
    changed = quantize(glb)
    changed = bool(trim_channels(glb)) or changed
    if changed:
        glb.save(path)
    if stats is not None:
        stats["bytes"] = os.path.getsize(path)
    return stats


def main(argv):
    check = "--check" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    bad = 0
    for path in paths:
        key = os.path.basename(path).removesuffix(".glb")
        if check:
            ok = packed(Glb(path))
            bad += not ok
            if not ok:
                print(f"{key}: not packed")
            continue
        before = os.path.getsize(path)
        sp = os.path.join(STATS, f"{key}.json")
        stats = json.load(open(sp)) if os.path.exists(sp) else None
        patch(path, stats)
        if stats is not None:
            tmp = os.path.join(STATS, f".{key}.json.tmp")
            with open(tmp, "w") as f:
                json.dump(stats, f, indent=1)
                f.write("\n")
            os.replace(tmp, sp)
        print(f"{key}: {before // 1024} -> {os.path.getsize(path) // 1024} KB")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
