import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBlocksMove } from '../src/movement_collision.ts';

test('a newly active landing rail permits retreat and sliding, but not crossing', () => {
  assert.equal(boxBlocksMove(0, -.4, .2, -.5, 2.88, .53), false);
  assert.equal(boxBlocksMove(0, -.4, .2, -.4, 2.88, .53), false);
  assert.equal(boxBlocksMove(0, -.4, .2, -.2, 2.88, .53), true);
  assert.equal(boxBlocksMove(0, -.4, .2, .6, 2.88, .53), true);
});

test('recovering from a rail still checks the neighboring tower wall', () => {
  // The same world-space move leaves a horizontal rail toward a vertical wall.
  assert.equal(boxBlocksMove(0, -.4, .3, -.6, 2.88, .53), false);
  assert.equal(boxBlocksMove(-.8, 0, -.5, -.2, .7, 1.45), true);
});

test('an embedded body can escape through the closest face on either axis', () => {
  for (const sign of [-1, 1]) {
    assert.equal(boxBlocksMove(sign*.4, 0, sign*.8, .1, .53, 2.88), false);
    assert.equal(boxBlocksMove(sign*.4, 0, sign*.2, .1, .53, 2.88), true);
    assert.equal(boxBlocksMove(0, sign*.4, .1, sign*.8, 2.88, .53), false);
  }
});

test('clear starting positions still collide at body-expanded box edges', () => {
  assert.equal(boxBlocksMove(0, -.6, .2, -.52, 2.88, .53), true);
  assert.equal(boxBlocksMove(0, -.6, .2, -.54, 2.88, .53), false);
});
