// The old Moonmere stays retired (MOONMERE.md "The old city, retired", 2026-10-09). It replaced
// tools/qa/moonmere_retire_list.py, the generator of what the retirement would delete: once the
// deletion was done, the one thing worth checking is that none of it comes back. The likeliest way
// back is a merge -- the Caerdun branch, which merges first, still carries every old body in its
// scene.ts, and a conflict resolved by taking "theirs" would bring a body back unseen. No Babylon:
// the source text, with comments stripped (a comment may still name the old city's history).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const at = (p) => new URL(p, import.meta.url);
const read = (p) => fs.readFileSync(at(p), 'utf8');
const exists = (p) => fs.existsSync(at(p));

/** code only: // and /* *\/ comments removed, strings kept (naive about regex literals) */
function code(src) {
  let out = '', q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      out += c;
      if (c === '\\') { out += src[++i] ?? ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    out += c;
  }
  return out;
}

const OLD_FILES = ['moonmere-architecture.ts', 'moonmere-city.ts', 'moonmere-ground-mask.ts', 'moonmere-landscape.ts', 'moonmere-plan.ts', 'moonmere-plaster.ts'];
// what scene.ts held for the old city (renamed survivors: MM2_BLEND/GRADE/STEP are ROAD_BLEND/GRADE/STEP;
// mere2Height keeps its name and only its first line, held below; and, once both cities had merged,
// the house pads, the gatehouse and its wall torches, which the old city was among the last to call)
const SCENE_SYMBOLS = /\b(housePads|makeGatehouse|wallTorch|mmLegacy|MM2_[A-Z_0-9]+|mm2[A-Z][A-Za-z0-9]*|buildMoonmere2|MM_STREET|mmGround|MOONMERE_LAWN|MoonmereGroundPlugin|MoonmerePavingWeatherPlugin|moonmerePaving|enlargeMoonmere|nearestMoonmereRoad|inspectMoonmereRoads|setMoonmereArchitecture|setMoonmereHarbour)\b|mmoldcw|'annex_room'|moonmere-(landscape|plan)/;
// (and the kit's street helpers the old city was the last to call: buildStreet, then planStreet,
// dressPath and StreetSpec, retired 2026-10-10 -- main still carries all three until this merges;
// and the landing guards' always-empty record, guardRecords / inspectGuards, after both merges)
const TOWN_SYMBOLS = /\b(guardRecords|inspectGuards|moonmereArchitecture|moonmereHarbour|houseDistrict|facadeTint|landingGuard|moonmereDistrict|moonmereModule|restyleMoonmere|MoonmereDistrict|buildStreet|planStreet|dressPath|StreetSpec)\b|moonmere-architecture|moonmere\//;
// the 46 module files that went (client/public/models/moonmere/; wall_door, the annex door's frame,
// on 2026-10-10 once the Long Tower framed that door itself); 16 stay
const RETIRED = ['banner', 'bollard', 'chimney', 'corner', 'doorframe', 'floor_stone', 'floor_wood', 'foundation', 'home_bedside',
  'landing_rail', 'quay_block', 'quay_coping', 'quay_floor', 'quay_lamp',
  ...[[4, [4, 6, 8]], [6, [4, 6, 8, 10, 12, 14, 16, 18]], [8, [8, 10, 12, 14, 16, 18]], [10, [8, 10, 12, 14, 16, 18]]].flatMap(([w, ds]) => ds.map((d) => `roof_${w}x${d}`)),
  'stair_rails', 'stair_solid', 'wall_plain', 'wall_sconce', 'wall_thin', 'wall_wide', 'window_thin', 'window_wide', 'wall_door'];
const KEPT = ['bed', 'bench', 'bookcase', 'desk', 'door', 'home_chair', 'home_chest', 'home_cupboard', 'home_herbs', 'home_rug',
  'home_table', 'music_box', 'seal_press', 'star_globe', 'telescope', 'water_clock'];
const RETIRED_QA = ['moonmere_city', 'moonmere_exterior', 'moonmere_homes', 'moonmere_paving', 'moonmere_review_fixes',
  'moonmere_harbour', 'tower_collision', 'observatory_routes', 'moonmere_doors', 'quest_sites', 'indoor_camera'];

function srcFiles(dir = '../src/') {
  const out = [];
  for (const e of fs.readdirSync(at(dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...srcFiles(`${dir}${e.name}/`));
    else if (e.name.endsWith('.ts')) out.push(`${dir}${e.name}`);
  }
  return out;
}

test('the old Moonmere\'s six client files and its review page stay gone', () => {
  for (const f of OLD_FILES) assert.ok(!exists(`../src/${f}`), `client/src/${f} is back`);
  assert.doesNotMatch(code(read('../src/main.ts')), /moonmere-city/, 'main.ts serves ?moonmere-city again');
  for (const f of srcFiles()) {
    const c = code(read(f));
    for (const old of OLD_FILES) assert.ok(!c.includes(`./${old.replace(/\.ts$/, '')}`), `${f} imports ${old}`);
  }
});

test('scene.ts carries none of the old city\'s code', () => {
  const lines = code(read('../src/scene.ts')).split('\n');
  const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => SCENE_SYMBOLS.test(l));
  assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 100)}`), []);
  assert.ok(lines.some((l) => /\bROAD_GRADE\b/.test(l)), 'the shared road grade (once MM2_GRADE) is still there');
  const at = lines.findIndex((l) => /^function mere2Height\(\)/.test(l));
  assert.ok(at >= 0 && /^\s*fineTerrainZones\.add\("moonmere"\); return fieldHeight\("moonmere"\);\s*$/.test(lines[at + 1]) && /^\}\s*$/.test(lines[at + 2]),
    'mere2Height is the new city\'s one line (the field height on the fine grid), not the old body');
});

test('town.ts carries none of the old city\'s architecture or harbour branches', () => {
  const lines = code(read('../src/town.ts')).split('\n');
  const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => TOWN_SYMBOLS.test(l));
  assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 100)}`), []);
});

test('models/moonmere/ holds the 16 kept modules, each still placed, and none of the 46', () => {
  const dir = '../public/models/moonmere/';
  const glbs = fs.readdirSync(at(dir)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort();
  assert.equal(RETIRED.length, 46);
  assert.deepEqual(glbs, [...KEPT].sort());
  assert.deepEqual(Object.keys(JSON.parse(read(`${dir}manifest.json`))).sort(), [...KEPT].sort(), 'manifest.json lists exactly the files');
  const all = srcFiles().map((f) => code(read(f))).join('\n');
  for (const n of RETIRED) assert.ok(!all.includes(`moonmere/${n}.glb`), `client code places moonmere/${n}.glb again`);
  // and no name pattern still matches one: a regex literal escapes the slash (`moonmere\/name`),
  // and may list names in a group (`moonmere\/(desk|globe)`) -- the legacy diet once kept one
  const inRegex = new Set([...all.matchAll(/moonmere\\\/(\(([^)]*)\)|[A-Za-z0-9_]+)/g)]
    .flatMap((m) => (m[2] ?? m[1]).split('|')));
  for (const n of RETIRED) assert.ok(!inRegex.has(n), `a pattern still matches the retired moonmere/${n}.glb`);
  // every kept file has a placer: its literal path, or its name beside a 'moonmere/'+name placement
  const zones = JSON.parse(read('../../shared/data/zones.json'));
  const props = new Set(Object.values(zones).flatMap((z) => [...(z.interactables ?? []), ...(z.furnishings ?? [])].map((r) => r.prop)));
  const byName = srcFiles().map((f) => code(read(f))).filter((c) => /'moonmere\/'\s*\+|`moonmere\/\$\{/.test(c)).join('\n');
  for (const n of KEPT) {
    assert.ok(all.includes(`moonmere/${n}.glb`) || byName.includes(`'${n}'`) || props.has(n), `nothing places moonmere/${n}.glb: retire it too`);
  }
});

test('the old city\'s QA scripts stay retired', () => {
  for (const n of RETIRED_QA) assert.ok(!exists(`../../tools/qa/${n}.mjs`), `tools/qa/${n}.mjs is back`);
  assert.ok(!exists('../../tools/qa/moonmere_retire_list.py'), 'the retire list is back: this test replaced it');
});
