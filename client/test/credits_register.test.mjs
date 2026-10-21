// Every folder of models the game ships is accounted for in CREDITS.md: listed
// as one of the repository's own, or credited with its pack, author and licence.
// A new pack dropped into client/public/models fails here until it is credited.
// Tracked files only: an empty or local folder never ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const credits = readFileSync(root + 'CREDITS.md', 'utf8');
const tracked = execFileSync('git', ['ls-files', 'client/public/models'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).map((p) => p.slice('client/public/models/'.length));

test('every model folder is credited or listed as original in CREDITS.md', () => {
  const dirs = [...new Set(tracked.filter((p) => p.includes('/')).map((p) => p.split('/')[0]))];
  assert.ok(dirs.length > 0);
  const missing = dirs.filter((d) => !credits.includes('`' + d + '/`'));
  assert.deepEqual(missing, [], `not in CREDITS.md: ${missing.join(', ')}`);
});

test('the loose models at the top of client/public/models are credited', () => {
  if (tracked.some((p) => !p.includes('/') && p.endsWith('.glb'))) assert.match(credits, /loose `\.glb` files at the top level/);
});
