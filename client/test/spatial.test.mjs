import test from 'node:test';
import assert from 'node:assert/strict';
import { CellIndex, SegmentTree, segmentDistance } from '../src/spatial.ts';

// The scan these structures replace: every segment in order, first nearest wins.
function scan(segs, x, z) {
  let best = Infinity, bi = -1;
  for (let i = 0; i < segs.length / 4; i++) {
    const d = segmentDistance(x, z, segs[i * 4], segs[i * 4 + 1], segs[i * 4 + 2], segs[i * 4 + 3]);
    if (d < best) { best = d; bi = i; }
  }
  return [bi, best];
}
function rand(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

test('the segment tree returns the scan\'s nearest segment and distance exactly', () => {
  const r = rand(7);
  for (const count of [0, 1, 3, 5, 17, 260]) {
    const segs = [];
    // a wandering polyline, like a road or a coast, plus a few stray segments
    let x = -200, z = 30;
    for (let i = 0; i < count; i++) { const nx = x + (r() - .3) * 40, nz = z + (r() - .5) * 40; segs.push(x, z, nx, nz); x = nx; z = nz; }
    const tree = new SegmentTree(segs);
    for (let k = 0; k < 2000; k++) {
      const px = (r() - .5) * 900, pz = (r() - .5) * 900;
      const [bi, best] = scan(segs, px, pz);
      assert.equal(tree.nearest(px, pz), bi);
      assert.equal(tree.d, best);
    }
  }
});

test('ties go to the lower index, as the scan\'s strict comparison does', () => {
  // a polyline's shared vertex is equidistant from both segments meeting there,
  // and a closed square is equidistant from opposite sides at its centre
  const segs = [0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0, 5, 5, 5, 5];
  const tree = new SegmentTree(segs);
  for (const [x, z] of [[15, -5], [5, 5], [10, 0], [-3, 13], [5, 5.0000001]]) {
    const [bi, best] = scan(segs, x, z);
    assert.equal(tree.nearest(x, z), bi, `at ${x},${z}`);
    assert.equal(tree.d, best);
  }
  // degenerate (zero-length) segments are points
  const dots = [3, 3, 3, 3, 3, 3, 3, 3, -4, 1, -4, 1];
  const dt = new SegmentTree(dots);
  assert.equal(dt.nearest(3, 4), 0);
  assert.equal(dt.nearest(-4, 9), 2);
});

test('non-finite points are handed back to the caller\'s own scan', () => {
  const tree = new SegmentTree([0, 0, 1, 1]);
  assert.equal(tree.nearest(NaN, 0), null);
  assert.equal(tree.nearest(0, Infinity), null);
  assert.equal(new SegmentTree([]).nearest(1, 2), -1);
});

test('the cell index returns every item whose box covers the point, in insertion order', () => {
  const r = rand(11), idx = new CellIndex(8), boxes = [];
  for (let i = 0; i < 400; i++) {
    const cx = (r() - .5) * 300, cz = (r() - .5) * 300, ex = r() * 20, ez = r() * 20;
    boxes.push([cx - ex, cx + ex, cz - ez, cz + ez]);
    idx.add(i, cx - ex, cx + ex, cz - ez, cz + ez);
  }
  // one item that cannot be placed must still come back everywhere, in order
  idx.add(400, NaN, 1, 0, 1); boxes.push(null);
  for (let k = 0; k < 3000; k++) {
    const x = (r() - .5) * 340, z = (r() - .5) * 340, got = idx.query(x, z);
    const inside = boxes.map((b, i) => b === null || (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) ? i : -1).filter((i) => i >= 0);
    for (const i of inside) assert.ok(got.includes(i), `item ${i} missing at ${x},${z}`);
    assert.deepEqual([...got], [...got].sort((a, b) => a - b));
  }
  assert.equal(idx.query(NaN, 0), null);
  assert.throws(() => idx.add(3, 0, 1, 0, 1));
});
