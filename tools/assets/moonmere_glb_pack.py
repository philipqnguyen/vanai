"""Moonmere's GLB packer: rewrites a Blender-exported GLB into a smaller core glTF 2.0
GLB with NO extensions (MOONMERE.md section 5, "GLB packer"). Pure python (struct,
json), so Blender's interpreter and plain python3 both run it.

    pack(glb_bytes) -> {'glb': bytes, 'verts': int, 'uv16': bool}

What it does, per primitive:
  * COLOR_0 (the baked AO, grey) -> VEC4 normalised UNSIGNED_BYTE;
  * TEXCOORD_0 -> VEC2 normalised UNSIGNED_SHORT when every triangle fits ONE copy of
    the sheet. The tiling strips run on in U (a box-UV'd wall reaches u = 3.4), so each
    triangle is shifted by a whole number of sheet widths to put its u in [0, 1] (the
    strips tile in U, so a whole-sheet shift samples the same texels), splitting a
    vertex that two triangles want shifted differently. If any triangle still spans a
    sheet edge, that primitive keeps FLOAT UVs (the core spec's other choice) -- never a
    wrong texel;
  * indices -> UNSIGNED_SHORT when there are fewer than 65,536 vertices;
  * POSITION and NORMAL stay FLOAT (core glTF allows nothing else without
    KHR_mesh_quantization, and the game loads core only).
Deterministic: the same input gives the same bytes (no clocks, ordered JSON).
"""
import json, struct, math

F32, U8, U16, U32 = 5126, 5121, 5123, 5125
_NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
_FMT = {F32: 'f', U8: 'B', U16: 'H', U32: 'I', 5120: 'b', 5122: 'h'}
_SIZE = {F32: 4, U8: 1, U16: 2, U32: 4, 5120: 1, 5122: 2}
_NORM_DIV = {U8: 255.0, U16: 65535.0, 5120: 127.0, 5122: 32767.0}


def _read_glb(b):
    magic, ver, length = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67, 'not a GLB'
    jl, jt = struct.unpack_from('<II', b, 12)
    js = json.loads(b[20:20 + jl].decode('utf8'))
    off = 20 + jl
    bin_ = b''
    if off < len(b):
        bl, bt = struct.unpack_from('<II', b, off)
        bin_ = b[off + 8: off + 8 + bl]
    return js, bin_


def _accessor(js, bin_, i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    n = _NCOMP[a['type']]; ct = a['componentType']
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or n * _SIZE[ct]
    fmt = '<' + _FMT[ct] * n
    out = []
    for k in range(a['count']):
        v = struct.unpack_from(fmt, bin_, base + k * stride)
        if a.get('normalized'):
            v = tuple(max(-1.0, c / _NORM_DIV[ct]) for c in v)
        out.append(v)
    return out


class _Out:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accs = []

    def add(self, data, ctype, typ, target=None, normalized=False, minmax=False):
        n = _NCOMP[typ]
        while len(self.bin) % 4: self.bin.append(0)
        off = len(self.bin)
        fmt = '<' + _FMT[ctype] * n
        for v in data: self.bin += struct.pack(fmt, *v)
        view = {'buffer': 0, 'byteOffset': off, 'byteLength': len(self.bin) - off}
        if target: view['target'] = target
        self.views.append(view)
        acc = {'bufferView': len(self.views) - 1, 'componentType': ctype, 'count': len(data), 'type': typ}
        if normalized: acc['normalized'] = True
        if minmax:
            acc['min'] = [min(v[c] for v in data) for c in range(n)]
            acc['max'] = [max(v[c] for v in data) for c in range(n)]
        self.accs.append(acc)
        return len(self.accs) - 1


def _q(x, d): return int(round(min(1.0, max(0.0, x)) * d))


def pack(glb):
    js, bin_ = _read_glb(glb)
    out = _Out()
    total_verts = 0
    all_uv16 = True
    for mesh in js.get('meshes', []):
        for prim in mesh['primitives']:
            at = prim['attributes']
            pos = _accessor(js, bin_, at['POSITION'])
            nrm = _accessor(js, bin_, at['NORMAL']) if 'NORMAL' in at else None
            uv = _accessor(js, bin_, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
            col = _accessor(js, bin_, at['COLOR_0']) if 'COLOR_0' in at else None
            idx = [v[0] for v in _accessor(js, bin_, prim['indices'])] if 'indices' in prim else list(range(len(pos)))
            tris = [idx[k:k + 3] for k in range(0, len(idx), 3)]
            # ---- try to put every triangle on one copy of the sheet in U
            remap = {}; nv = []; ntris = []; fits = uv is not None
            if uv is not None:
                for t in tris:
                    us = [uv[i][0] for i in t]; vs = [uv[i][1] for i in t]
                    k = math.floor(min(us) + 1e-7)
                    if max(us) - k > 1.0 + 1e-6 or min(vs) < -1e-6 or max(vs) > 1.0 + 1e-6:
                        fits = False; break
            if fits:
                for t in tris:
                    k = math.floor(min(uv[i][0] for i in t) + 1e-7)
                    nt = []
                    for i in t:
                        key = (i, k)
                        j = remap.get(key)
                        if j is None:
                            j = len(nv); remap[key] = j; nv.append((i, k))
                        nt.append(j)
                    ntris.append(nt)
            else:
                nv = [(i, 0) for i in range(len(pos))]
                ntris = tris
                if uv is not None: all_uv16 = False
            P = [pos[i] for i, k in nv]
            new = {'POSITION': out.add(P, F32, 'VEC3', 34962, minmax=True)}
            if nrm is not None: new['NORMAL'] = out.add([nrm[i] for i, k in nv], F32, 'VEC3', 34962)
            if uv is not None:
                if fits:
                    new['TEXCOORD_0'] = out.add([(_q(uv[i][0] - k, 65535), _q(uv[i][1], 65535)) for i, k in nv], U16, 'VEC2', 34962, normalized=True)
                else:
                    new['TEXCOORD_0'] = out.add([uv[i] for i, k in nv], F32, 'VEC2', 34962)
            if col is not None:
                c4 = []
                for i, k in nv:
                    c = col[i]; c = tuple(c) + (1.0,) * (4 - len(c))
                    c4.append(tuple(_q(x, 255) for x in c[:4]))
                new['COLOR_0'] = out.add(c4, U8, 'VEC4', 34962, normalized=True)
            flat = [j for t in ntris for j in t]
            if len(nv) < 65536:
                prim['indices'] = out.add([(j,) for j in flat], U16, 'SCALAR', 34963)
            else:
                prim['indices'] = out.add([(j,) for j in flat], U32, 'SCALAR', 34963)
            prim['attributes'] = new
            prim.pop('extras', None)
            total_verts += len(nv)
    js['accessors'] = out.accs
    js['bufferViews'] = out.views
    while len(out.bin) % 4: out.bin.append(0)
    js['buffers'] = [{'byteLength': len(out.bin)}]
    for k in ('extensionsUsed', 'extensionsRequired', 'extras'):
        js.pop(k, None)
    for m in js.get('materials', []): m.pop('extras', None); m.pop('extensions', None)
    for n in js.get('nodes', []): n.pop('extras', None)
    for m in js.get('meshes', []): m.pop('extras', None)
    js['asset'] = {'version': '2.0', 'generator': 'moonmere_glb_pack'}
    jb = json.dumps(js, separators=(',', ':')).encode('utf8')
    while len(jb) % 4: jb += b' '
    total = 12 + 8 + len(jb) + 8 + len(out.bin)
    glb_out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + \
        struct.pack('<II', len(out.bin), 0x004E4942) + bytes(out.bin)
    return {'glb': glb_out, 'verts': total_verts, 'uv16': all_uv16}


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        b = open(f, 'rb').read(); r = pack(b)
        print(f, len(b), '->', len(r['glb']), 'uv16' if r['uv16'] else 'uv float')
