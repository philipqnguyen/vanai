// The plan cache (zones/caerdun_plan.ts planCache): the parts of Caerdun's plan the
// zone glue builds from, written as data so the zone does not plan on entry.
//   node tools/data/caerdun_plan_cache.mjs          -- write client/src/caerdun-fortress-plan.json
//   node tools/data/caerdun_plan_cache.mjs --check  -- exit 1 when it is stale
// Re-run after any change to caerdun-fortress-layout.json or a caerdun_* planner;
// client/test/caerdun_plan_cache.test.mjs holds the file to the planner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCaerdun, planCache } from '../../client/src/zones/caerdun_plan.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = JSON.parse(fs.readFileSync(path.join(root, 'client/src/caerdun-fortress-layout.json'), 'utf8'));
const out = path.join(root, 'client/src/caerdun-fortress-plan.json');
const json = JSON.stringify(planCache(planCaerdun(L)));
if (process.argv.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === json;
  console.log(same ? 'plan cache current' : 'plan cache STALE: run node tools/data/caerdun_plan_cache.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, json);
console.log('wrote', out, json.length, 'bytes');
