// The village-kit palettes (town.ts setPalette/registerPalette) fail SILENTLY:
// a sheet file that is not there is a 404 and a black or grey roof, and a
// material name the kit does not have is a map entry nothing ever matches, so
// the piece keeps the kit's red. Neither shows up anywhere but a screenshot.
// These read the source as text (town.ts pulls in the scene and Babylon, so
// it cannot be imported under node) and hold every palette to the files and
// materials that actually exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const TOWN = new URL('../public/models/town/', import.meta.url).pathname;
const TOOL = new URL('../../tools/assets/recolor_kit_tex.py', import.meta.url).pathname;

function tsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(p) : /\.ts$/.test(e.name) ? [p] : [];
  });
}
const sources = tsFiles(SRC).map((p) => [path.relative(SRC, p), fs.readFileSync(p, 'utf8')]);

// every material name any village-kit piece carries
const kitMaterials = new Set(fs.readdirSync(TOWN).filter((f) => f.endsWith('.gltf'))
  .flatMap((f) => (JSON.parse(fs.readFileSync(path.join(TOWN, f), 'utf8')).materials || []).map((m) => m.name)));

// "MI_Name": "T_..._BaseColor_x.jpg" pairs, wherever a palette spells them
const PAIR = /\b(MI_\w+)\s*:\s*["'](T_\w+?\.jpg)["']/g;

test('every recoloured sheet the client names exists in models/town', () => {
  const named = new Set();
  for (const [, text] of sources) for (const m of text.matchAll(/["'](T_\w+_BaseColor_\w+\.jpg)["']/g)) named.add(m[1]);
  assert.ok(named.size >= 5, `found only ${named.size} sheet names: the pattern has drifted`);
  for (const f of named) assert.ok(fs.existsSync(path.join(TOWN, f)), `${f} is named in src but missing from public/models/town`);
});

test('every palette entry maps a material the kit actually has', () => {
  let n = 0;
  for (const [file, text] of sources) {
    for (const m of text.matchAll(PAIR)) {
      n++;
      assert.ok(kitMaterials.has(m[1]), `${file}: ${m[1]} is no village-kit material, so ${m[2]} is never applied`);
    }
  }
  assert.ok(n >= 8, `found only ${n} palette entries: the pattern has drifted`);
});

test('every sheet recolor_kit_tex.py writes is on disk, and from a real source', () => {
  const py = fs.readFileSync(TOOL, 'utf8');
  const rows = [...py.matchAll(/\("(T_\w+\.jpg)",\s*"(T_\w+\.jpg)",\s*"#[0-9a-f]{6}"/g)];
  assert.ok(rows.length >= 5, `found only ${rows.length} SHEETS rows`);
  for (const [, src, dst] of rows) {
    assert.ok(fs.existsSync(path.join(TOWN, src)), `SHEETS source ${src} missing`);
    assert.ok(fs.existsSync(path.join(TOWN, dst)), `SHEETS output ${dst} not generated`);
  }
});

// MEASURED 2026-10-04: a deep "@babylonjs/core/Materials/PBR/pbrMaterial"
// import got its own copy of the class in Vite's dev dependency bundle, so
// `instanceof PBRMaterial` failed on the glTF loader's materials and every
// palette swap silently did nothing in dev (production dedupes and was fine).
// One import path is one class.
test('no client source imports a Babylon class from a deep @babylonjs/core path', () => {
  for (const [file, text] of sources) {
    const deep = text.match(/from\s+["']@babylonjs\/core\/[^"']+["']/);
    assert.equal(deep, null, `${file}: ${deep && deep[0]} -- import from "@babylonjs/core"`);
  }
});
