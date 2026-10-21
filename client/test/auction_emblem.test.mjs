// The auction house's emblem is one symbol in every city and on every map (Philip,
// 2026-10-11): the generators' shared roundel (tools/assets/auction_emblem.py, a
// balance carved or painted in each city's materials) is the map's own glyph
// (client/src/map_services.ts SERVICE_STYLE.auction.glyph), which is the Capital's
// auction sign. Python is outside the node suite, so the glyph is read from its source.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SERVICE_STYLE } from '../src/map_services.ts';

const src = fs.readFileSync(new URL('../../tools/assets/auction_emblem.py', import.meta.url), 'utf8');

test('the carved emblem is the map\'s auction glyph', () => {
  const m = src.match(/^GLYPH = "([^"]+)"/m);
  assert.ok(m, 'auction_emblem.py has no GLYPH');
  assert.equal(m[1], SERVICE_STYLE.auction.glyph);
});

test('every city that carves it reads the shared module', () => {
  // Caerdun's Exchange (2026-10-11); a city added later imports the same file
  const caerdun = fs.readFileSync(new URL('../../tools/assets/caerdun_mod_auction.py', import.meta.url), 'utf8');
  assert.match(caerdun, /^import auction_emblem as E$/m);
  assert.match(caerdun, /E\.emblem_faces\(/);
  // the Capital's Exchange: its generator's emblem() relief, on the tower's four
  // faces, over the board and over each broker (CAPITAL.md "The Exchange")
  const capital = fs.readFileSync(new URL('../../tools/assets/build_capital_modules.py', import.meta.url), 'utf8');
  assert.match(capital, /^import auction_emblem$/m);
  assert.match(capital, /auction_emblem\.emblem_faces\(/);
  assert.ok((capital.match(/^\s+emblem\(/gm) ?? []).length >= 3, 'the tower, the board and the counters carry it');
});

test('Heartwood grows it from the shared module\'s data', () => {
  // Heartwood's city is generated in the browser, not baked by a generator, so
  // it reads the roundel as data: auction_emblem.py --json writes
  // client/src/auction-emblem.json, and its glyph rides along with it
  const data = JSON.parse(fs.readFileSync(new URL('../src/auction-emblem.json', import.meta.url), 'utf8'));
  assert.equal(data.glyph, SERVICE_STYLE.auction.glyph);
  assert.equal(data.source, 'tools/assets/auction_emblem.py --json');
  assert.match(src, /^def emblem_json\(\):$/m);
  const hw = fs.readFileSync(new URL('../src/heartwood-auction.ts', import.meta.url), 'utf8');
  assert.match(hw, /from '\.\/auction-emblem\.json'/);
  for (const v of ['sign', 'plaque']) assert.ok(data.variants[v].faces.some(([part]) => part === 'device'), v);
});
