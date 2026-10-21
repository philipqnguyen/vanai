// Character streaming (actor_stream_plan.ts): the nearest DETAIL_CAP characters
// in full detail regardless of distance, the rest nameplate only (Philip,
// 2026-10-13), with hysteresis so membership does not churn and a small cache
// so walking back and forth does not reload anyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DetailPlanner, DetailStreamer, DETAIL_CAP, SWAP_MARGIN, SWAP_HOLD_S, CACHE_SIZE, CACHE_TTL_S } from '../src/actor_stream_plan.ts';

// n characters on a line along x, one every `gap` metres from `from`
const line = (n, gap = 1, from = 1, prefix = 'c') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, x: from + i * gap, z: 0 }));
const ids = (set) => [...set].sort();

test('the constants are the ruling and sane margins', () => {
  assert.equal(DETAIL_CAP, 20);
  assert.ok(SWAP_MARGIN >= 2 && SWAP_MARGIN <= 6);
  assert.ok(SWAP_HOLD_S >= 0.5 && SWAP_HOLD_S <= 1);
  assert.ok(CACHE_SIZE >= 2 && CACHE_SIZE <= 4);
  assert.ok(CACHE_TTL_S > 0);
});

test('the nearest 20 are full detail, with no distance cutoff', () => {
  const p = new DetailPlanner();
  // 47 characters 100 m apart: even the nearest is far, and still drawn
  const far = line(47, 100, 1000).reverse();
  const s = p.update(0, 0, far, 0);
  assert.equal(s.full.size, 20);
  assert.deepEqual(ids(s.full), ids(new Set(line(20, 100, 1000).map((c) => c.id))));
  assert.equal(s.cached.size, 0, 'nothing was let go yet');
});

test('fewer candidates than the cap: all of them', () => {
  const s = new DetailPlanner().update(0, 0, line(7), 0);
  assert.equal(s.full.size, 7);
});

test('height counts when both sides give one (a floor above is not beside you)', () => {
  const p = new DetailPlanner({ cap: 1 });
  const s = p.update(0, 0, [{ id: 'above', x: 1, z: 0, y: 30 }, { id: 'beside', x: 5, z: 0, y: 0 }], 0, 0);
  assert.deepEqual(ids(s.full), ['beside']);
});

test('an outsider swaps in only when clearly closer and only after the hold', () => {
  const p = new DetailPlanner({ cap: 2 });
  let s = p.update(0, 0, [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 20, z: 0 }, { id: 'c', x: 30, z: 0 }], 0);
  assert.deepEqual(ids(s.full), ['a', 'b']);
  // c draws level with b, then slightly closer -- inside the margin: no swap, ever
  for (let t = 0; t <= 5; t += 0.25) s = p.update(0, 0, [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 20, z: 0 }, { id: 'c', x: 20 - SWAP_MARGIN + 0.5, z: 0 }], 1 + t);
  assert.deepEqual(ids(s.full), ['a', 'b'], 'within the margin nobody trades places');
  // clearly closer: not at once...
  const near = [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 20, z: 0 }, { id: 'c', x: 12, z: 0 }];
  s = p.update(0, 0, near, 10);
  assert.deepEqual(ids(s.full), ['a', 'b']);
  s = p.update(0, 0, near, 10 + SWAP_HOLD_S / 2);
  assert.deepEqual(ids(s.full), ['a', 'b']);
  // ...but once it has stayed so for the hold
  s = p.update(0, 0, near, 10 + SWAP_HOLD_S);
  assert.deepEqual(ids(s.full), ['a', 'c']);
  assert.deepEqual(ids(s.cached), ['b'], 'the one let go is cached');
});

test('a challenger that falls back loses its claim (the hold starts over)', () => {
  const p = new DetailPlanner({ cap: 1 });
  const at = (cx) => [{ id: 'm', x: 20, z: 0 }, { id: 'c', x: cx, z: 0 }];
  p.update(0, 0, at(40), 0);
  p.update(0, 0, at(5), 1);                      // clearly closer from t = 1
  p.update(0, 0, at(30), 1 + SWAP_HOLD_S * 0.9); // falls back before the hold
  let s = p.update(0, 0, at(5), 1 + SWAP_HOLD_S * 1.1);
  assert.deepEqual(ids(s.full), ['m'], 'the earlier claim does not count');
  s = p.update(0, 0, at(5), 1 + SWAP_HOLD_S * 2.2);
  assert.deepEqual(ids(s.full), ['c']);
});

test('standing still in a crowd never churns', () => {
  const p = new DetailPlanner();
  // 47 people milling within a few metres of each other
  const crowd = (t) => Array.from({ length: 47 }, (_, i) => ({ id: `n${i}`, x: 10 + (i % 7) * 1.5 + Math.sin(t * 3 + i) * 0.8, z: Math.floor(i / 7) * 1.5 + Math.cos(t * 2 + i) * 0.8 }));
  let first = null, changes = 0, prev = '';
  for (let t = 0; t < 30; t += 0.25) {
    const key = ids(p.update(10, 4, crowd(t), t).full).join();
    if (first === null) first = key; else if (key !== prev) changes++;
    prev = key;
  }
  assert.equal(changes, 0, `membership changed ${changes} times while nobody really moved`);
});

test('a free slot is filled at once, nearest first', () => {
  const p = new DetailPlanner({ cap: 3 });
  p.update(0, 0, line(5), 0);
  // c1 leaves: c3 (the nearest outsider) takes its place with no hold
  const s = p.update(0, 0, line(5).filter((c) => c.id !== 'c1'), 0.01);
  assert.deepEqual(ids(s.full), ['c0', 'c2', 'c3']);
});

test('a teleport swaps the whole set after one hold', () => {
  const p = new DetailPlanner({ cap: 20 });
  const west = line(20, 1, 1, 'w').map((c) => ({ ...c, x: -c.x - 500 }));
  const east = line(20, 1, 1, 'e').map((c) => ({ ...c, x: c.x + 500 }));
  let s = p.update(-500, 0, [...west, ...east], 0);
  assert.ok([...s.full].every((id) => id.startsWith('w')));
  s = p.update(500, 0, [...west, ...east], 1);
  assert.ok([...s.full].every((id) => id.startsWith('w')), 'held for a moment');
  s = p.update(500, 0, [...west, ...east], 1 + SWAP_HOLD_S);
  assert.equal(s.full.size, 20);
  assert.ok([...s.full].every((id) => id.startsWith('e')), 'the crowd arriving swaps in as one');
  assert.equal(s.cached.size, CACHE_SIZE, 'only the cache-sized few stay loaded');
});

test('pinned characters are always full detail, even past the cap', () => {
  const p = new DetailPlanner({ cap: 2 });
  const cs = [...line(4), { id: 'cast', x: 900, z: 0, pinned: true }];
  let s = p.update(0, 0, cs, 0);
  assert.ok(s.full.has('cast'));
  assert.equal(s.full.size, 2, 'the pin takes a slot');
  const many = [...line(4), ...[1, 2, 3].map((i) => ({ id: `cast${i}`, x: 900 + i, z: 0, pinned: true }))];
  s = p.update(0, 0, many, 1);
  assert.deepEqual(ids(s.full), ['cast1', 'cast2', 'cast3'], 'pins beyond the cap all stay; nobody else');
  // the pins lifted: the near ones come back after the hold, the cast goes
  s = p.update(0, 0, line(4).concat(many.slice(4).map((c) => ({ ...c, pinned: false }))), 2);
  s = p.update(0, 0, line(4).concat(many.slice(4).map((c) => ({ ...c, pinned: false }))), 2 + SWAP_HOLD_S);
  assert.deepEqual(ids(s.full), ['c0', 'c1']);
});

test('the cache keeps the most recent few and lets them go after a while', () => {
  const p = new DetailPlanner({ cap: 1, cacheSize: 2, cacheTtl: 10 });
  const at = (who) => [{ id: who, x: 1, z: 0 }, ...['a', 'b', 'c', 'd'].filter((i) => i !== who).map((id, k) => ({ id, x: 50 + k, z: 0 }))];
  let t = 0;
  const visit = (who) => { p.update(0, 0, at(who), t); t += SWAP_HOLD_S; return p.update(0, 0, at(who), t); };
  visit('a'); visit('b'); visit('c');
  let s = visit('d');
  assert.deepEqual(ids(s.full), ['d']);
  assert.deepEqual(ids(s.cached), ['b', 'c'], 'oldest (a) dropped first');
  s = visit('b');
  assert.deepEqual(ids(s.cached), ['c', 'd'], 'b came back out of the cache');
  t += 11;
  s = p.update(0, 0, at('b'), t);
  assert.equal(s.cached.size, 0, 'expired');
});

test('forget and gone-from-the-list leave no trace', () => {
  const p = new DetailPlanner({ cap: 1 });
  const moved = line(3, 10, 20).map((c, i) => (i === 2 ? { ...c, x: 5 } : c)); // c2 walks up, well inside c0
  p.update(0, 0, line(3, 10, 20), 0);
  p.update(0, 0, moved, 0.1);
  let s = p.update(0, 0, moved, 1);
  assert.deepEqual(ids(s.full), ['c2']);
  assert.deepEqual(ids(s.cached), ['c0']);
  s = p.update(0, 0, [moved[2]], 1.1); // c0 and c1 left the zone
  assert.equal(s.cached.size, 0);
  p.forget('c2');
  s = p.update(0, 0, [], 1.2);
  assert.equal(s.full.size, 0);
});

// The streamer applies the plan through the hooks: each character built once
// while it stays loaded, hidden into the cache, shown back without a rebuild,
// disposed once it is let go for good.
function harness(options) {
  const log = [], live = new Map(), made = new Map();
  let serial = 0;
  const streamer = new DetailStreamer({
    build(id) {
      const a = { id, n: ++serial, disposed: false }; made.set(a.n, a); log.push(`build ${id}`);
      if (id.startsWith('throw')) throw new Error('no such race');
      return id.startsWith('bad') ? null : a;
    },
    show(id, a) { assert.ok(!a.disposed); live.set(id, a); log.push(`show ${id}`); },
    hide(id, a) { assert.ok(!a.disposed); live.delete(id); log.push(`hide ${id}`); },
    dispose(id, a) { assert.ok(!a.disposed, `${id} disposed twice`); a.disposed = true; live.delete(id); log.push(`dispose ${id}`); },
  }, options);
  return { streamer, log, live, made };
}

test('the streamer builds, caches, re-shows and frees exactly once each', () => {
  const { streamer, log, live } = harness({ cap: 1, cacheSize: 1, cacheTtl: 100 });
  const at = (who) => ['a', 'b', 'c'].map((id) => ({ id, x: id === who ? 1 : 50, z: 0 }));
  let t = 0;
  const go = (who) => { streamer.update(0, 0, at(who), t); t += 1; streamer.update(0, 0, at(who), t); t += 1; };
  go('a');
  assert.deepEqual([...live.keys()], ['a']);
  go('b');
  assert.deepEqual([...live.keys()], ['b']);
  const first = streamer.get('a');
  go('a'); // back again: the cached copy, not a new build
  assert.equal(streamer.get('a'), first);
  assert.equal(log.filter((l) => l === 'build a').length, 1);
  go('c'); // a cached, b evicted (cache holds one)
  assert.ok(log.includes('dispose b'));
  go('b');
  assert.equal(log.filter((l) => l === 'build b').length, 2, 'evicted: rebuilt');
  streamer.disposeAll();
  assert.equal(live.size, 0);
});

test('a failed build keeps its slot without rebuilding every tick', () => {
  const { streamer, log } = harness({ cap: 3 });
  const error = console.error; console.error = () => {};
  try {
    for (let t = 0; t < 3; t += 0.25) streamer.update(0, 0, [{ id: 'bad1', x: 1, z: 0 }, { id: 'throw1', x: 1.5, z: 0 }, { id: 'ok', x: 2, z: 0 }], t);
  } finally { console.error = error; }
  assert.equal(log.filter((l) => l === 'build bad1').length, 1);
  assert.equal(log.filter((l) => l === 'build throw1').length, 1, 'a throwing build is caught, logged once, not retried');
  assert.ok(streamer.full('ok'));
  assert.ok(!streamer.full('bad1') || streamer.get('bad1') === null);
});

test('drop, discard and replace', () => {
  const { streamer, log, live } = harness({ cap: 1, cacheSize: 2 });
  streamer.update(0, 0, [{ id: 'a', x: 1, z: 0 }, { id: 'b', x: 30, z: 0 }], 0);
  streamer.update(0, 0, [{ id: 'a', x: 30, z: 0 }, { id: 'b', x: 1, z: 0 }], 1);
  streamer.update(0, 0, [{ id: 'a', x: 30, z: 0 }, { id: 'b', x: 1, z: 0 }], 2);
  assert.deepEqual([...live.keys()], ['b']);
  streamer.discard('b'); // shown: not a cache entry, untouched
  assert.ok(!log.includes('dispose b'));
  streamer.discard('a'); // its look changed while cached
  assert.ok(log.includes('dispose a'));
  const rebuilt = { id: 'b', n: -1, disposed: false };
  streamer.replace('b', rebuilt);
  assert.equal(streamer.get('b'), rebuilt);
  streamer.drop('b');
  assert.ok(rebuilt.disposed, 'drop frees the held (replaced) one');
  assert.equal(streamer.update(0, 0, [], 3).full.size, 0);
});
