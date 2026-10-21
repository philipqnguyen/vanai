// The plan cache is the planner's own output (zones/caerdun_plan.ts planCache): the
// zone builds from client/src/caerdun-fortress-plan.json instead of planning on entry
// (fix round 3, the perf review's WebKit build), so the file must be exactly what the
// planner makes from the layout today. Stale? node tools/data/caerdun_plan_cache.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCaerdun, planCache } from '../src/zones/caerdun_plan.ts';

test('the plan cache is planCache(planCaerdun(layout)) byte for byte (re-run tools/data/caerdun_plan_cache.mjs)', () => {
  const L = JSON.parse(fs.readFileSync(new URL('../src/caerdun-fortress-layout.json', import.meta.url), 'utf8'));
  const cached = fs.readFileSync(new URL('../src/caerdun-fortress-plan.json', import.meta.url), 'utf8');
  assert.ok(cached === JSON.stringify(planCache(planCaerdun(L))), 'client/src/caerdun-fortress-plan.json is stale: node tools/data/caerdun_plan_cache.mjs');
});
