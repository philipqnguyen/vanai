// MM-16 (MOONMERE.md A-14, the S4 review fix): bake the city as the Moonmere Shores see it -- the
// pieces at their far forms in the Shores' frame, the houses' bodies for their hours, the island's
// painted ground -- into client/src/moonmere-view.json, so the Shores never run planMoonmere.
//
//     node tools/data/moonmere_view_bake.mjs          # write
//     node tools/data/moonmere_view_bake.mjs --check  # exit 1 if the file is stale
//
// Re-run after any change to moonmere-layout.json, a planner, the module list or moonmere_view.ts;
// test/moonmere_causeway.test.mjs fails until the file matches a fresh bake.
import fs from 'node:fs';
const root = new URL('../../client/', import.meta.url);
const { planMoonmere } = await import(new URL('src/zones/moonmere_plan.ts', root));
const { bakeView } = await import(new URL('src/zones/moonmere_view.ts', root));
const L = JSON.parse(fs.readFileSync(new URL('src/moonmere-layout.json', root)));
const out = JSON.stringify(bakeView(planMoonmere(L, { flightBodies: true })));
const file = new URL('src/moonmere-view.json', root);
if (process.argv.includes('--check')) {
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === out;
  console.log(same ? 'moonmere-view.json is current' : 'moonmere-view.json is STALE: run node tools/data/moonmere_view_bake.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(file, out);
console.log(`wrote ${file.pathname} (${(out.length / 1024).toFixed(0)} KB)`);
