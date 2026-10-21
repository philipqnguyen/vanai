// The social windows' paging and friend action (client/src/social_model.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageOf, friendAction, ROSTER_PAGE } from '../src/social_model.ts';

const list = (n) => Array.from({ length: n }, (_, i) => i);

test('a roster pages at the roster size, the last page short', () => {
  const p1 = pageOf(list(45), 1);
  assert.equal(p1.pages, 3);
  assert.equal(p1.rows.length, ROSTER_PAGE);
  const p3 = pageOf(list(45), 3);
  assert.deepEqual(p3.rows, [40, 41, 42, 43, 44]);
});

test('an empty roster is one empty page', () => {
  assert.deepEqual(pageOf([], 1), { rows: [], page: 1, pages: 1 });
});

test('a page past the end is the last page, and before the start the first', () => {
  assert.equal(pageOf(list(21), 5).page, 2);
  assert.equal(pageOf(list(21), 0).page, 1);
  assert.equal(pageOf(list(21), NaN).page, 1);
});

test('the friend item adds a stranger and removes a friend, whatever the case', () => {
  const friends = new Set(['aria']);
  assert.equal(friendAction(friends, 'Aria').op, 'remove');
  assert.equal(friendAction(friends, 'Bram').op, 'add');
  assert.match(friendAction(friends, 'Aria').label, /Remove/);
});
