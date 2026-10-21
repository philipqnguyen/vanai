// Readers for module tests: a GLB's JSON chunk and accessors, an 8-bit PNG's
// texels (zlib and the five scanline filters), a baseline JPEG's texels, an
// image's size, and the triangle-in-box clip the opening checks use. The GLB and
// PNG readers are copied from capital_modules.test.mjs (that test is not edited);
// the JPEG decoder is new, so a test can read every shipped sheet without an
// image library.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

// A minimal GLB reader: the JSON chunk, and an accessor as a typed array.
export function readGlb(url) {
  const buf = fs.readFileSync(url);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${url}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const accessor = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const off = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { a, data: new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)), n };
  };
  // accessor min/max are LOCAL to a node: bounds checks are only valid while
  // every node is untransformed
  for (const nd of json.nodes ?? []) {
    for (const k of ['translation', 'rotation', 'scale', 'matrix']) assert.equal(nd[k], undefined, `${url}: node ${nd.name} has a ${k}`);
  }
  let tris = 0; const mats = new Set(); const prims = [];
  for (const m of json.meshes) for (const p of m.primitives) {
    assert.equal(p.mode ?? 4, 4, `${url}: triangles only`);
    tris += (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
    mats.add(json.materials[p.material].name);
    prims.push(p);
  }
  return { json, accessor, tris, mats, prims };
}

// Every triangle of a GLB (or of the primitives whose material passes `keep`):
// [[x, y, z] x 3], with its material name.
export function* triangles(g, keep = () => true) {
  for (const p of g.prims) {
    const mat = g.json.materials[p.material].name;
    if (!keep(mat)) continue;
    const { data } = g.accessor(p.attributes.POSITION);
    const idx = p.indices !== undefined ? g.accessor(p.indices).data : Array.from({ length: data.length / 3 }, (_, i) => i);
    const v = (i) => [data[3 * i], data[3 * i + 1], data[3 * i + 2]];
    for (let t = 0; t < idx.length; t += 3) yield { tri: [v(idx[t]), v(idx[t + 1]), v(idx[t + 2])], mat };
  }
}

// Clip a triangle to an axis-aligned box (Sutherland-Hodgman, six planes): any
// area left means the triangle passes through the box, even with every corner
// outside it (a quad spanning the opening).
export function triInBox(tri, lo, hi) {
  let poly = tri;
  for (let ax = 0; ax < 3 && poly.length; ax++) {
    for (const [lim, sgn] of [[lo[ax], 1], [hi[ax], -1]]) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = (a[ax] - lim) * sgn, db = (b[ax] - lim) * sgn;
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
      }
      poly = out;
      if (!poly.length) break;
    }
  }
  if (poly.length < 3) return false;
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const u = poly[i].map((v, k) => v - poly[0][k]), w = poly[i + 1].map((v, k) => v - poly[0][k]);
    area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
  }
  return area > 1e-6;
}

// [width, height] from a PNG's IHDR or a JPEG's start-of-frame.
export function imageSize(url) {
  const b = fs.readFileSync(url);
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  assert.equal(b.readUInt16BE(0), 0xffd8, `${url}: neither PNG nor JPEG`);
  for (let i = 2; i < b.length;) {
    const marker = b.readUInt16BE(i), len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  assert.fail(`${url}: no size`);
}

// An 8-bit RGB(A) PNG decoded to rows: enough to read a texel without a library.
export function readPng(url) {
  const b = fs.readFileSync(url);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25];
  assert.ok(depth === 8 && (type === 2 || type === 6), `${url}: 8-bit RGB(A) only`);
  const bpp = type === 6 ? 4 : 3, idat = [];
  for (let i = 8; i < b.length;) {
    const len = b.readUInt32BE(i), kind = b.toString('ascii', i + 4, i + 8);
    if (kind === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      out[y * stride + x] = (src[x] + pred) & 255;
    }
  }
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) { rgb[3 * i] = out[j]; rgb[3 * i + 1] = out[j + 1]; rgb[3 * i + 2] = out[j + 2]; }
  return { w, h, rgb, px: (x, y) => [rgb[3 * (y * w + x)], rgb[3 * (y * w + x) + 1], rgb[3 * (y * w + x) + 2]] };
}

// A baseline (sequential, Huffman) JPEG decoded to RGB -- PIL's q90 sheets with
// no chroma subsampling: three components sampled 1 x 1, restart markers allowed.
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const COS = (() => {
  const c = new Float64Array(64);
  for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) c[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2;
  return c;
})();
export function readJpeg(url) {
  const b = fs.readFileSync(url);
  assert.equal(b.readUInt16BE(0), 0xffd8, `${url}: not a JPEG`);
  const qt = [], dc = [], ac = [];
  let w = 0, h = 0, comps = [], restart = 0, pos = 2;
  const huff = (lengths, symbols) => {
    // canonical codes -> a map keyed by (length << 16) | code
    const map = new Map(); let code = 0, k = 0;
    for (let L = 1; L <= 16; L++) { for (let i = 0; i < lengths[L - 1]; i++) map.set((L << 16) | code++, symbols[k++]); code <<= 1; }
    return map;
  };
  let scan = -1;
  while (pos < b.length) {
    const marker = b.readUInt16BE(pos), len = b.readUInt16BE(pos + 2), seg = b.subarray(pos + 4, pos + 2 + len);
    if (marker === 0xffdb) {
      for (let i = 0; i < seg.length;) {
        const pq = seg[i] >> 4, tq = seg[i] & 15; assert.equal(pq, 0, `${url}: 8-bit tables only`);
        qt[tq] = Array.from(seg.subarray(i + 1, i + 65)); i += 65;
      }
    } else if (marker === 0xffc0) {
      h = seg.readUInt16BE(1); w = seg.readUInt16BE(3);
      for (let i = 0; i < seg[5]; i++) {
        const c = { id: seg[6 + 3 * i], hv: seg[7 + 3 * i], tq: seg[8 + 3 * i] };
        assert.equal(c.hv, 0x11, `${url}: chroma subsampled (the sheets are written without)`);
        comps.push(c);
      }
    } else if (marker === 0xffc2 || marker === 0xffc1) {
      assert.fail(`${url}: not baseline`);
    } else if (marker === 0xffc4) {
      for (let i = 0; i < seg.length;) {
        const tc = seg[i] >> 4, th = seg[i] & 15, lengths = Array.from(seg.subarray(i + 1, i + 17)), n = lengths.reduce((s, x) => s + x, 0);
        (tc ? ac : dc)[th] = huff(lengths, Array.from(seg.subarray(i + 17, i + 17 + n))); i += 17 + n;
      }
    } else if (marker === 0xffdd) {
      restart = seg.readUInt16BE(0);
    } else if (marker === 0xffda) {
      for (let i = 0; i < seg[0]; i++) {
        const c = comps.find((q) => q.id === seg[1 + 2 * i]); c.td = seg[2 + 2 * i] >> 4; c.ta = seg[2 + 2 * i] & 15;
      }
      scan = pos + 2 + len; break;
    }
    pos += 2 + len;
  }
  assert.ok(scan > 0 && comps.length === 3, `${url}: a 3-component baseline scan`);
  const mw = Math.ceil(w / 8), mh = Math.ceil(h / 8);
  const planes = comps.map(() => new Float32Array(mw * 8 * mh * 8));
  let p = scan, bits = 0, nbits = 0;
  const bit = () => {
    if (nbits === 0) {
      let byte = b[p++];
      if (byte === 0xff) { const nx = b[p]; if (nx === 0) p++; else if (nx >= 0xd0 && nx <= 0xd7) { p++; byte = b[p++]; } }
      bits = byte; nbits = 8;
    }
    nbits--; return (bits >> nbits) & 1;
  };
  const decode = (map) => { let code = 0; for (let L = 1; L <= 16; L++) { code = (code << 1) | bit(); const s = map.get((L << 16) | code); if (s !== undefined) return s; } throw new Error(`${url}: bad Huffman code`); };
  const receive = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v < (1 << (n - 1)) ? v - (1 << n) + 1 : v; };
  const pred = [0, 0, 0], blk = new Float64Array(64), tmp = new Float64Array(64);
  let mcu = 0;
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    if (restart && mcu > 0 && mcu % restart === 0) {
      // byte-align and skip the RSTn marker
      nbits = 0; while (p < b.length && !(b[p] === 0xff && b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7)) p++; p += 2; pred.fill(0);
    }
    mcu++;
    comps.forEach((c, ci) => {
      blk.fill(0);
      const t = decode(dc[c.td]); pred[ci] += t ? receive(t) : 0; blk[0] = pred[ci] * qt[c.tq][0];
      for (let k = 1; k < 64;) {
        const rs = decode(ac[c.ta]), r = rs >> 4, s = rs & 15;
        if (s === 0) { if (r === 15) { k += 16; continue; } break; }
        k += r; blk[ZIGZAG[k]] = receive(s) * qt[c.tq][k]; k++;
      }
      // separable IDCT: rows then columns
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * blk[y * 8 + u]; tmp[y * 8 + x] = s; }
      const pl = planes[ci], W8 = mw * 8;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x]; pl[(my * 8 + y) * W8 + mx * 8 + x] = s + 128; }
    });
  }
  const rgb = Buffer.alloc(w * h * 3), W8 = mw * 8, cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * W8 + x, Y = planes[0][i], cb = planes[1][i] - 128, cr = planes[2][i] - 128, o = 3 * (y * w + x);
    rgb[o] = cl(Y + 1.402 * cr); rgb[o + 1] = cl(Y - 0.344136 * cb - 0.714136 * cr); rgb[o + 2] = cl(Y + 1.772 * cb);
  }
  return { w, h, rgb, px: (x, y) => [rgb[3 * (y * w + x)], rgb[3 * (y * w + x) + 1], rgb[3 * (y * w + x) + 2]] };
}

// An image of either kind.
export function readImage(url) {
  const b = fs.readFileSync(url);
  return b.toString('ascii', 1, 4) === 'PNG' ? readPng(url) : readJpeg(url);
}
