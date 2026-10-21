// The ability icons' contact sheet: every ability in abilities.json drawn by
// abilityStrokeIcon at hotbar size (24 px), buff size (18 px) and 48 px, job
// by job on the HUD's slot colours, so a new glyph is looked at before it is
// kept. Writes tmp/ability-icons/sheet.html and sheet.png (gitignored).
//
//   node tools/qa/ability_icon_sheet.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChromium, ROOT } from './lib/playwright.mjs';
import { abilityStrokeIcon } from '../../client/src/icons.ts';

const A = JSON.parse(readFileSync(join(ROOT, 'shared/data/abilities.json'), 'utf8'));
const jobs = {};
for (const [id, ab] of Object.entries(A)) (jobs[ab.job] ??= []).push({ id, ...ab });
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = `<!doctype html><meta charset="utf-8"><title>Ability icons</title><style>
body{margin:0;padding:16px;background:#1a1f22;color:#e3dac6;font:12px/1.3 system-ui}
h2{font-size:13px;margin:14px 0 6px;color:#c9b27c}
.row{display:flex;flex-wrap:wrap;gap:6px}
.ab{width:92px;background:#2a3034;border:1px solid #3b4347;border-radius:8px;padding:6px 4px;text-align:center}
.ab .big{display:flex;justify-content:center;gap:6px;align-items:flex-end;color:#f1ead8}
.ab .nm{margin-top:4px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab .lv{color:#8a9397;font-size:9px}
</style>` + Object.entries(jobs).map(([j, l]) => `<h2>${j}</h2><div class="row">` + l.sort((a, b) => a.lvl - b.lvl).map((ab) =>
  `<div class="ab"><div class="big">${abilityStrokeIcon(ab, 48)}${abilityStrokeIcon(ab, 24)}${abilityStrokeIcon(ab, 18)}</div><div class="nm">${esc(ab.name)}</div><div class="lv">Lv ${ab.lvl} · ${ab.kind}</div></div>`).join('') + '</div>').join('');
const out = join(ROOT, 'tmp/ability-icons');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'sheet.html'), html);
const browser = await launchChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file://' + join(out, 'sheet.html'));
await page.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
await browser.close();
console.log('wrote', join(out, 'sheet.png'));
