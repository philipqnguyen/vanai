// The baked backdrops of open-air dungeons (client/src/dungeon-backdrop.ts,
// tools/assets/bake_backdrop.mjs) agree with the registry the client reads:
// every entry names a real dungeon and a real field parent, and its picture is
// on disk at the registry's width and band, within the 1.5 MB budget. A change
// to `band` or `width` without a re-bake fails here rather than as a stretched
// sky in the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const reg = JSON.parse(fs.readFileSync(new URL('src/dungeon-backdrops.json', root), 'utf8'));
const zones = JSON.parse(fs.readFileSync(new URL('../shared/data/zones.json', root), 'utf8'));

// width and height from a baseline or progressive JPEG's frame header
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

for (const [key, spec] of Object.entries(reg.specs)) {
  test(`${key}: a dungeon with a field parent and a baked backdrop that fits the registry`, () => {
    assert.equal(zones[key]?.kind, 'dungeon');
    assert.ok(zones[spec.parent] && zones[spec.parent].kind !== 'dungeon', `${spec.parent} is a field zone`);
    assert.equal(spec.from.length, 3);
    const file = new URL(`public/backdrops/${key}.jpg`, root);
    assert.ok(fs.existsSync(file), `public/backdrops/${key}.jpg is baked`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length <= 1.5e6, `${buf.length} bytes`);
    const size = jpegSize(buf);
    const band = Math.round(reg.width * (reg.band[1] - reg.band[0]) / 360);
    assert.deepEqual(size, { w: reg.width, h: 2 * band });
  });
}
