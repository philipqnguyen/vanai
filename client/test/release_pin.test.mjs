// The asset index pins the GitHub Release of the character runtime it was tested
// against (npm run assets:import copies it from the runtime folder's release.json;
// bin/fetch-runtime installs it). An index without one would leave a fresh clone
// with nothing to fetch: release in the maker, then import again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const index=JSON.parse(fs.readFileSync(new URL('../src/asset-index.json',import.meta.url),'utf8'));

test('the asset index pins a runtime release',()=>{
  assert.ok(index.release,'client/src/asset-index.json has no "release": in the maker node tools/runtime/release.mjs, then npm run assets:import');
  assert.match(index.release.repo,/^[\w.-]+\/[\w.-]+$/);
  assert.match(index.release.tag,/^runtime-\d{4}\.\d{2}\.\d{2}\.\d+$/,'a runtime tag is runtime-YYYY.MM.DD.N');
});
