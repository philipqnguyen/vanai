"""Keep every clip's body out of the ground: the ground clamp. Pure numpy.

    python3 tools/assets/creatures/ground_clips.py client/public/models/creatures/the_reaper.glb [...]
    python3 tools/assets/creatures/ground_clips.py --check client/public/models/creatures/*.glb

Round 1's clips were posed by hand, and a fall pivoted about the feet drives a
body through the floor: about sixty Death clips (and some Idle and Attack
clips) put the body 0.5-3.5 m under y = 0 (tmp/bestiary/REVIEW-1.md). The
clamp reads the GLB as the game plays it -- the LOD0 mesh skinned by its own
joints, inverse binds and the animation's keys, exactly glTF's linear blend --
and, at every key whose lowest BODY vertex is under the ground by more than a
tolerance, lifts the skeleton's root by world +y until that vertex is on y = 0.

- It only ever lifts. A floating wisp or a hovering wasp stays where it is.
- Held props (Part.held: weapons, tools, lanterns) do not count: a halberd
  may lie in the grass, and a sceptre that dips below the feet must not
  stand the Regent on tiptoe. The test still holds them to -0.15 x height.
- Keys that do not sink are left alone, so Walk and Run keep the foot
  contact their IK placed. Trailing bones (TRAIL: tails, skirts, capes,
  robes...) drive the lift only in Death; elsewhere a dipped tail is the
  clip's to raise, never a reason to float the feet. Where the lift is
  needed it is eased in and out
  at a bounded speed (LIFT_RATE heights per second, wrapping round a loop)
  so a two-frame dip does not pop the body up and down.
- The lift goes on the top joint ("root") as a translation channel in its
  parent's space, so every bone under it -- and both LODs -- move together.

It runs at the end of every build (build.py), and stand-alone on a GLB that is
already built, in place, with no Blender: the patched file is re-packed with
only the buffer data still referenced, so patching twice does not grow it
(a second run finds nothing to lift and writes nothing). It records in the
creature's client/src/creatures/<key>.json:
  held        LOD0 vertex ranges [start, end) of held props, in the GLB's own
              vertex order (the node test reads them)
  groundLift  {clip: the largest lift in metres} for each lifted clip
  bytes       the file's new size

Which vertices are held is decided by the spec: each vertex belongs to the
piece (the body or a part) whose true surface it lies on, |sdf| smallest.
A stand-alone run imports only the creature's own plan file (its stats'
`planFile`), and only when its stats lack `held`.
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
STATS = os.path.join(ROOT, "client", "src", "creatures")

TOL_M = 0.03          # a key whose body sinks deeper than this is lifted ...
TOL_H = 0.02          # ... or deeper than this fraction of the height, if smaller (a pigeon)
LIFT_RATE = 1.5       # the lift eases in and out at most this many heights per second
LOOPS = {"Idle", "Walk", "Run", "Cast", "Fly"}   # the clips the game loops (wrap the easing)
# Bones that trail from the body -- tails, skirts, capes, robes, veils, sheets,
# tongues -- rather than stand on the ground. A tail or a skirt dipped into the
# ground in a stride is the clip's to fix (raise it): lifting the whole body for
# it would float the feet off their contact (the rat's Run tail, -0.58 m, would
# have the rat running on air). So they drive the lift only in Death, where a
# corpse must lie on its cloak, not through it. The node test still holds
# every body vertex, trailing or not, to -0.05 x height in every clip.
TRAIL = ("tail", "skirt", "l_skirt", "coat_", "veil", "cape", "cope", "g_trail", "g_tails", "sheet", "robe", "train",
         "tabard", "apron", "petal", "tongue", "strip")
LIFT_ALL = {"Death"}     # the clips whose trailing bones drive the lift too

_DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_W = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
_NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


# --------------------------------------------------------------------------- the file

class Glb:
    """A GLB's JSON and binary chunk, with accessors read as float arrays and
    new ones appended; save() re-packs the binary chunk with only what the
    JSON still references."""

    def __init__(self, path):
        data = open(path, "rb").read()
        magic, _ver, _n = struct.unpack_from("<III", data, 0)
        assert magic == 0x46546C67, f"{path} is not a GLB"
        jl, jt = struct.unpack_from("<II", data, 12)
        assert jt == 0x4E4F534A
        self.json = json.loads(data[20:20 + jl])
        o = 20 + jl
        bl, bt = struct.unpack_from("<II", data, o)
        assert bt == 0x004E4942
        self.bin = data[o + 8:o + 8 + bl]
        self.extra = []           # (bufferView index, bytes) appended since loading

    def acc(self, i):
        a = self.json["accessors"][i]
        assert "sparse" not in a, "sparse accessors are not read here"
        v = self.json["bufferViews"][a["bufferView"]]
        dt = np.dtype(_DT[a["componentType"]]).newbyteorder("<")
        n = _W[a["type"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", 0) or dt.itemsize * n
        raw = self._view_bytes(a["bufferView"])
        base = start - v.get("byteOffset", 0)
        arr = np.ndarray((a["count"], n), dtype=dt, buffer=raw, offset=base, strides=(stride, dt.itemsize))
        out = arr.astype(np.float64)
        if a.get("normalized") and a["componentType"] in _NORM:
            out /= _NORM[a["componentType"]]
        return out

    def _view_bytes(self, vi):
        for i, b in self.extra:
            if i == vi:
                return b
        v = self.json["bufferViews"][vi]
        o = v.get("byteOffset", 0)
        return self.bin[o:o + v["byteLength"]]

    def add_accessor(self, arr, typ, minmax=False):
        arr = np.ascontiguousarray(arr, dtype="<f4")
        n = _W[typ]
        arr = arr.reshape(-1, n)
        b = arr.tobytes()
        vi = len(self.json["bufferViews"])
        self.json["bufferViews"].append({"buffer": 0, "byteOffset": -1, "byteLength": len(b)})
        self.extra.append((vi, b))
        a = {"bufferView": vi, "componentType": 5126, "count": len(arr), "type": typ}
        if minmax:
            a["min"] = [float(x) for x in arr.min(0)]
            a["max"] = [float(x) for x in arr.max(0)]
        self.json["accessors"].append(a)
        return len(self.json["accessors"]) - 1

    def save(self, path):
        j = self.json
        # what is still referenced: every accessor a mesh, skin or animation names,
        # every buffer view an accessor or image names
        used_acc = set()
        for m in j.get("meshes", []):
            for p in m["primitives"]:
                used_acc.update(p["attributes"].values())
                if "indices" in p:
                    used_acc.add(p["indices"])
                for t in p.get("targets", []):
                    used_acc.update(t.values())
        for s in j.get("skins", []):
            if "inverseBindMatrices" in s:
                used_acc.add(s["inverseBindMatrices"])
        for an in j.get("animations", []):
            used = {c["sampler"] for c in an["channels"]}
            keep = sorted(used)
            remap_s = {old: new for new, old in enumerate(keep)}
            an["samplers"] = [an["samplers"][i] for i in keep]
            for c in an["channels"]:
                c["sampler"] = remap_s[c["sampler"]]
            for sm in an["samplers"]:
                used_acc.update((sm["input"], sm["output"]))
        acc_keep = sorted(used_acc)
        acc_map = {old: new for new, old in enumerate(acc_keep)}
        accessors = [j["accessors"][i] for i in acc_keep]
        used_bv = {a["bufferView"] for a in accessors if "bufferView" in a}
        used_bv |= {im["bufferView"] for im in j.get("images", []) if "bufferView" in im}
        bv_keep = sorted(used_bv)
        bv_map = {old: new for new, old in enumerate(bv_keep)}
        chunks, views, off = [], [], 0
        for old in bv_keep:
            v = dict(j["bufferViews"][old])
            b = self._view_bytes(old)
            pad = (-off) % 4
            if pad:
                chunks.append(b"\0" * pad)
                off += pad
            v["byteOffset"] = off
            v["byteLength"] = len(b)
            chunks.append(b)
            off += len(b)
            views.append(v)
        for a in accessors:
            if "bufferView" in a:
                a["bufferView"] = bv_map[a["bufferView"]]
        for im in j.get("images", []):
            if "bufferView" in im:
                im["bufferView"] = bv_map[im["bufferView"]]
        for m in j.get("meshes", []):
            for p in m["primitives"]:
                p["attributes"] = {k: acc_map[v] for k, v in p["attributes"].items()}
                if "indices" in p:
                    p["indices"] = acc_map[p["indices"]]
                if "targets" in p:
                    p["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in p["targets"]]
        for s in j.get("skins", []):
            if "inverseBindMatrices" in s:
                s["inverseBindMatrices"] = acc_map[s["inverseBindMatrices"]]
        for an in j.get("animations", []):
            for sm in an["samplers"]:
                sm["input"], sm["output"] = acc_map[sm["input"]], acc_map[sm["output"]]
        j["accessors"], j["bufferViews"] = accessors, views
        binary = b"".join(chunks)
        binary += b"\0" * ((-len(binary)) % 4)
        j["buffers"] = [{"byteLength": len(binary)}]
        js = json.dumps(j, separators=(",", ":")).encode()
        js += b" " * ((-len(js)) % 4)
        out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
        out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
        tmp = path + ".clamp.tmp"
        with open(tmp, "wb") as f:
            f.write(out)
        os.replace(tmp, path)
        self.bin, self.extra = binary, []


# --------------------------------------------------------------------------- poses

def _quat_mats(q):
    """(..., 4) xyzw -> (..., 3, 3)"""
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    return np.stack([np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1),
                     np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1),
                     np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1)], -2)


def _sample(times, vals, interp, T, path):
    """A channel's value at times T (glTF's STEP / LINEAR; slerp for rotations)."""
    times = np.asarray(times, float).ravel()
    if interp == "CUBICSPLINE":   # (in-tangent, value, out-tangent) per key: take the values, linearly
        vals = vals.reshape(len(times), 3, -1)[:, 1]
        interp = "LINEAR"
    if len(times) == 1:
        return np.repeat(vals[:1], len(T), 0)
    i = np.clip(np.searchsorted(times, T, side="right") - 1, 0, len(times) - 1)
    if interp == "STEP":
        return vals[i]
    j = np.minimum(i + 1, len(times) - 1)
    span = np.maximum(times[j] - times[i], 1e-9)
    u = np.clip((T - times[i]) / span, 0.0, 1.0)[:, None]
    a, b = vals[i], vals[j]
    if path != "rotation":
        return a * (1 - u) + b * u
    d = (a * b).sum(1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1))
    s = np.sin(th)
    small = s[:, 0] < 1e-6
    wa = np.where(small[:, None], 1 - u, np.sin((1 - u) * th) / np.where(small[:, None], 1, s))
    wb = np.where(small[:, None], u, np.sin(u * th) / np.where(small[:, None], 1, s))
    q = wa * a + wb * b
    return q / np.linalg.norm(q, axis=1, keepdims=True)


def _trs(t, r, s):
    M = np.zeros(t.shape[:-1] + (4, 4))
    M[..., :3, :3] = _quat_mats(r) * s[..., None, :]
    M[..., :3, 3] = t
    M[..., 3, 3] = 1.0
    return M


class Rigged:
    """The GLB's LOD0 mesh, skin and node tree, posed at an animation's keys."""

    def __init__(self, glb: Glb):
        j = glb.json
        self.glb = glb
        self.nodes = j["nodes"]
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        lod0 = [i for i, m in enumerate(j["meshes"]) if m["name"].endswith("_LOD0")]
        mi = lod0[0] if lod0 else 0
        prim = j["meshes"][mi]["primitives"][0]
        self.P = glb.acc(prim["attributes"]["POSITION"])
        self.J = glb.acc(prim["attributes"]["JOINTS_0"]).astype(int)
        self.W = glb.acc(prim["attributes"]["WEIGHTS_0"])
        skin = j["skins"][0]
        self.joints = skin["joints"]
        self.ibm = glb.acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major
        jset = set(self.joints)
        self.tops = [n for n in self.joints if self.parent.get(n) not in jset]
        # every node a joint's world matrix depends on, parents first
        need = set()
        for n in self.joints:
            while n is not None and n not in need:
                need.add(n)
                n = self.parent.get(n)
        self.order = sorted(need, key=lambda n: self._depth(n))   # parents first

    def _depth(self, n):
        d = 0
        while n in self.parent:
            n = self.parent[n]
            d += 1
        return d

    def trailing(self):
        """Vertices whose strongest joint trails from the body (TRAIL)."""
        names = [self.nodes[n].get("name", "") for n in self.joints]
        tr = np.array([nm.startswith(TRAIL) for nm in names])
        return tr[self.J[np.arange(len(self.J)), self.W.argmax(1)]]

    def rest(self, n):
        nd = self.nodes[n]
        if "matrix" in nd:
            M = np.array(nd["matrix"], float).reshape(4, 4).T
            t = M[:3, 3].copy()
            S = np.linalg.norm(M[:3, :3], axis=0)
            R = M[:3, :3] / S[None, :]
            from_mat = _mat_quat(R)
            return t, from_mat, S
        return (np.array(nd.get("translation", [0, 0, 0]), float), np.array(nd.get("rotation", [0, 0, 0, 1]), float),
                np.array(nd.get("scale", [1, 1, 1]), float))

    def channels(self, anim):
        """{node: {path: (times, values, interpolation)}} and the clip's key times."""
        out, keys = {}, []
        for c in anim["channels"]:
            tgt = c["target"]
            if "node" not in tgt or tgt["path"] not in ("translation", "rotation", "scale"):
                continue
            sm = anim["samplers"][c["sampler"]]
            tt = self.glb.acc(sm["input"])[:, 0]
            out.setdefault(tgt["node"], {})[tgt["path"]] = (tt, self.glb.acc(sm["output"]), sm.get("interpolation", "LINEAR"))
            keys.append(tt)
        T = np.unique(np.round(np.concatenate(keys), 5)) if keys else np.zeros(1)
        return out, T

    def local(self, n, ch, T):
        t0, r0, s0 = self.rest(n)
        c = ch.get(n, {})
        t = _sample(*c["translation"][:3], T, "translation") if "translation" in c else np.tile(t0, (len(T), 1))
        r = _sample(*c["rotation"][:3], T, "rotation") if "rotation" in c else np.tile(r0, (len(T), 1))
        s = _sample(*c["scale"][:3], T, "scale") if "scale" in c else np.tile(s0, (len(T), 1))
        return t, r, s

    def world(self, ch, T, lift=None):
        """World matrices (len(T), 4, 4) of every needed node; `lift` (len(T),) raises the tops."""
        W = {}
        for n in self.order:
            M = _trs(*self.local(n, ch, T))
            p = self.parent.get(n)
            W[n] = W[p] @ M if p is not None else M
            if lift is not None and n in self.tops:
                W[n] = W[n].copy()
                W[n][:, 1, 3] += lift
        return W

    def heights(self, W, mask=None):
        """Skinned y of every vertex (or those in mask) at every key: (len(T), V)."""
        # only the y row of each skin matrix is needed
        Srow = np.stack([(W[n] @ self.ibm[k])[:, 1, :] for k, n in enumerate(self.joints)], 1)  # (T, J, 4)
        P, J, Wt = (self.P, self.J, self.W) if mask is None else (self.P[mask], self.J[mask], self.W[mask])
        Ph = np.concatenate([P, np.ones((len(P), 1))], 1)
        y = np.zeros((Srow.shape[0], len(P)))
        for k in range(J.shape[1]):
            w = Wt[:, k]
            if not w.any():
                continue
            y += w[None, :] * np.einsum("tvc,vc->tv", Srow[:, J[:, k]], Ph)
        return y


def _mat_quat(R):
    t = np.trace(R)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        return np.array([(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s])
    i = int(np.argmax(np.diag(R)))
    j_, k_ = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(1.0 + R[i, i] - R[j_, j_] - R[k_, k_]) * 2
    q = np.zeros(4)
    q[i] = 0.25 * s
    q[j_] = (R[j_, i] + R[i, j_]) / s
    q[k_] = (R[k_, i] + R[i, k_]) / s
    q[3] = (R[k_, j_] - R[j_, k_]) / s
    return q


# --------------------------------------------------------------------------- held props

def is_held(part):
    return bool(getattr(part, "held", False) or part.meta.get("held"))


def held_mask(spec, P):
    """Which points lie on a held prop: each point goes to the piece (the body
    or a part) whose own surface is nearest. The pieces are meshed separately
    and pulled back onto their own surfaces, so a vertex sits at |sdf| ~ 0 on
    its own piece."""
    held = [i + 1 for i, p in enumerate(spec.parts) if is_held(p)]
    if not held:
        return np.zeros(len(P), bool)
    nodes = [spec.body] + [p.node for p in spec.parts]
    D = np.stack([np.abs(nd.eval(P)) for nd in nodes], 1)
    return np.isin(D.argmin(1), held)


def to_ranges(mask):
    m = np.concatenate([[False], np.asarray(mask, bool), [False]])
    d = np.flatnonzero(m[1:] != m[:-1])
    return [[int(a), int(b)] for a, b in zip(d[0::2], d[1::2])]


def from_ranges(ranges, n):
    m = np.zeros(n, bool)
    for a, b in ranges:
        m[a:b] = True
    return m


# --------------------------------------------------------------------------- the clamp

def _ease(need, T, rate, loop):
    """The smallest lift >= need whose slope is at most `rate` (m/s): the
    upper envelope of cones of that slope on every needed key."""
    lift = np.zeros_like(need)
    idx = np.flatnonzero(need > 0)
    if not len(idx):
        return lift
    span = T[-1] - T[0]
    for i in idx:
        d = np.abs(T - T[i])
        if loop and span > 0:
            d = np.minimum(d, span - d)
        lift = np.maximum(lift, need[i] - rate * d)
    return np.maximum(lift, 0.0)


def clamp(glb: Glb, held: np.ndarray, height: float, verbose=True):
    """Lift every animation's sinking keys in place on `glb`. Returns
    {clip: (largest lift, body min before, body min after, held min after)}."""
    rg = Rigged(glb)
    j = glb.json
    tol = min(TOL_M, TOL_H * height)
    body = ~held
    trail = rg.trailing()
    report = {}
    for anim in j.get("animations", []):
        name = anim.get("name", "?")
        ch, T = rg.channels(anim)
        W = rg.world(ch, T)
        y = rg.heights(W)
        yb = y[:, body].min(1)
        drive = body if name in LIFT_ALL else body & ~trail
        yd = y[:, drive].min(1) if drive.any() else yb
        need = np.where(yd < -tol, -yd, 0.0)
        if not need.any():
            report[name] = (0.0, float(yb.min()), float(yb.min()), float(y[:, held].min()) if held.any() else None)
            continue
        lift = _ease(need, T, LIFT_RATE * height, name in LOOPS)
        # the lift is a world +y offset of each top joint, written as its
        # translation in its parent's space
        for top in rg.tops:
            p = rg.parent.get(top)
            if p is not None:
                Pw = rg.world(ch, T[:1])[p][0] if p in rg.order else np.eye(4)
            else:
                Pw = np.eye(4)
            up_local = np.linalg.solve(Pw[:3, :3], np.array([0.0, 1.0, 0.0]))
            t, _r, _s = rg.local(top, ch, T)
            new_t = t + lift[:, None] * up_local[None, :]
            inp = _same_input(glb, anim, T)
            if inp is None:
                inp = glb.add_accessor(T.astype(np.float32), "SCALAR", minmax=True)
            out = glb.add_accessor(new_t.astype(np.float32), "VEC3")
            sampler = {"input": inp, "output": out, "interpolation": "LINEAR"}
            chan = [c for c in anim["channels"] if c["target"].get("node") == top and c["target"]["path"] == "translation"]
            if chan:
                si = chan[0]["sampler"]
                shared = sum(1 for c in anim["channels"] if c["sampler"] == si) > 1
                if shared:
                    anim["samplers"].append(sampler)
                    chan[0]["sampler"] = len(anim["samplers"]) - 1
                else:
                    anim["samplers"][si] = sampler
            else:
                anim["samplers"].append(sampler)
                anim["channels"].append({"sampler": len(anim["samplers"]) - 1, "target": {"node": top, "path": "translation"}})
        # measure what the file now plays
        ch2, T2 = rg.channels(anim)
        y2 = rg.heights(rg.world(ch2, T2))
        report[name] = (float(lift.max()), float(yb.min()), float(y2[:, body].min()),
                        float(y2[:, held].min()) if held.any() else None)
    if verbose:
        for k, (l, b0, b1, h1) in report.items():
            if l > 0:
                print(f"  ground: {k} lifted up to {l:.3f} m (body low {b0:+.3f} -> {b1:+.3f}"
                      + (f", held low {h1:+.3f})" if h1 is not None else ")"))
    return report


def _same_input(glb, anim, T):
    """An input accessor of this animation that already holds exactly these times."""
    for sm in anim["samplers"]:
        a = glb.json["accessors"][sm["input"]]
        if a["count"] == len(T):
            tt = glb.acc(sm["input"])[:, 0]
            if np.allclose(tt, T, atol=1e-4):
                return sm["input"]
    return None


def measure(glb: Glb, held: np.ndarray):
    """{clip: (body min y, held min y or None)} over every key, as the file plays."""
    rg = Rigged(glb)
    out = {}
    for anim in glb.json.get("animations", []):
        ch, T = rg.channels(anim)
        y = rg.heights(rg.world(ch, T))
        out[anim.get("name", "?")] = (float(y[:, ~held].min()), float(y[:, held].min()) if held.any() else None)
    return out


def patch(path, held=None, spec=None, height=None, stats=None, verbose=True):
    """Clamp the GLB at `path` in place. `held` is a LOD0 vertex mask, or it is
    taken from `stats["held"]`, or classified from `spec`. Updates and returns
    `stats` (a dict, written by the caller) with held, groundLift and bytes."""
    glb = Glb(path)
    rg = Rigged(glb)
    n = len(rg.P)
    if held is None:
        if stats is not None and "held" in stats:
            held = from_ranges(stats["held"], n)
        elif spec is not None:
            held = held_mask(spec, rg.P)
        else:
            raise ValueError(f"{path}: no held record and no spec to classify one")
    if height is None:
        height = float(stats["height"]) if stats and "height" in stats else float(rg.P[~held, 1].max() if (~held).any() else rg.P[:, 1].max())
    rep = clamp(glb, held, height, verbose)
    lifted = {k: round(v[0], 3) for k, v in rep.items() if v[0] > 0}
    if lifted:
        glb.save(path)
    stats = dict(stats or {})
    stats["held"] = to_ranges(held)
    stats["groundLift"] = {**{k: v for k, v in (stats.get("groundLift") or {}).items() if k not in lifted}, **lifted}
    stats["bytes"] = os.path.getsize(path)
    return stats, rep


def _spec_for(key, stats):
    """The creature's spec, importing only its own plan file."""
    import importlib
    sys.path.insert(0, HERE)
    pf = stats.get("planFile", "")
    mod = pf.replace("tools/assets/creatures/", "").removesuffix(".py").replace("/", ".")
    if not mod.startswith("plans."):
        raise ValueError(f"{key}: no planFile in its stats")
    m = importlib.import_module(mod)
    return m.CREATURES[key]()


def main(argv):
    check = "--check" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    bad = 0
    for path in paths:
        key = os.path.basename(path).removesuffix(".glb")
        sp = os.path.join(STATS, f"{key}.json")
        stats = json.load(open(sp)) if os.path.exists(sp) else {}
        if check:
            glb = Glb(path)
            n = len(Rigged(glb).P)
            if "held" not in stats:
                print(f"{key}: no held record (not clamped yet)")
                bad += 1
                continue
            H = float(stats.get("height", 1.0))
            for clip, (b, h) in measure(glb, from_ranges(stats["held"], n)).items():
                fail = b < -0.05 * H or (h is not None and h < -0.15 * H)
                if fail:
                    bad += 1
                print(f"{key}/{clip}: body {b:+.3f}" + (f" held {h:+.3f}" if h is not None else "") + ("  FAIL" if fail else ""))
            continue
        print(f"[{key}]")
        spec = None if "held" in stats else _spec_for(key, stats)
        new, _rep = patch(path, spec=spec, stats=stats)
        if os.path.exists(sp):
            tmp = os.path.join(STATS, f".{key}.json.tmp")
            with open(tmp, "w") as f:
                json.dump(new, f, indent=1)
                f.write("\n")
            os.replace(tmp, sp)
        print(f"  held ranges {new['held']}, lifts {new['groundLift'] or 'none'}, {new['bytes']} bytes")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
