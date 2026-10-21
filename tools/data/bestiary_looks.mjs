// Which generated creature (GLB) and which palette variant each monster wears,
// from the bestiary plan.
//
//   node tools/data/bestiary_looks.mjs        (writes client/src/creature-looks.json)
//
// tools/data/bestiary_plan.json gives every monster a look. A shared look's
// GLB is named for the look ("wolf"); a unique's ("unique:gnarlfang") for the
// monster. Each monster stands at the plan's height_m.
//
// Palette variants: one GLB per look, and one painted atlas per variant on the
// same UVs (creatures/<look>@<variant>.jpg), swapped in by the client. A
// monster gets a variant when its palette, or the crusts its variant text
// names, differ from the look's base (the base palette, and the crusts its
// base-palette wearers share). Wearers with the same palette and crusts share
// one variant, named for the first of them in the plan. Crusts are the words
// a body plan's params list after "crusts:" (canine: ash, glass, bark, frost),
// found as whole words in the variant text -- "ash-grey" is a colour, not ash,
// but "glass-flecked" and "amber-sealed" are crusts.
//
// The look's spec repaints a variant from {id, palette, base_palette, crusts,
// text} (tools/assets/creatures/build.py passes it in); a monster whose variant
// atlas is not built yet wears the base atlas. Run this after the plan
// changes; client/test/creatures.test.mjs fails while file and plan disagree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A fallback until a variant's atlas is painted: a multiply over the base
// atlas, only where it is a small lightness shift of much the same hue (a
// multiply darkens or lightens; it cannot turn a green slime red). Linear light.
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbOf = (hex) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
export function fallbackTint(base, target) {
  const b = rgbOf(base), t = rgbOf(target);
  const r = t.map((v, i) => v / Math.max(b[i], 1e-3));
  const lo = Math.min(...r), hi = Math.max(...r);
  if (lo < 0.6 || hi > 1.6 || hi / lo > 1.25) return undefined;
  return r.map((v) => Math.round(v * 1000) / 1000);
}

/** the crust words a body plan admits (from its "crusts: a, b" param) */
export function crustWords(plan, bodyPlan) {
  const p = (plan.body_plans[bodyPlan]?.params || []).find((s) => /^crusts?\s*:/i.test(s));
  return p ? p.split(":")[1].split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) : [];
}

export function crustsOf(text, words) {
  const t = (text || "").toLowerCase();
  // "ash-grey" is a colour; "glass-flecked", "amber-sealed" are crusts
  return words.filter((w) => new RegExp(`\\b${w.replace(/[-]/g, "[- ]")}\\b(?!-(?!flecked|crusted|sealed|grown|caked|rimed))`).test(t)).sort();
}

/** {glbs: {glb: {look, plan, show, monsters, variants}}, monsters: {monster: {glb, h, variant?}}} */
export function looksFromPlan(plan) {
  const glbs = {}, monsters = {};
  const byGlb = {};
  for (const [key, m] of Object.entries(plan.monsters)) {
    const unique = m.look.startsWith("unique:");
    const glb = unique ? m.look.slice("unique:".length) : m.look;
    (byGlb[glb] ||= { look: m.look, plan: m.plan, unique, keys: [] }).keys.push(key);
  }
  for (const [glb, g] of Object.entries(byGlb)) {
    const words = crustWords(plan, g.plan);
    const base = g.unique ? null : (plan.looks[g.look]?.base_palette || null);
    const sig = (k) => JSON.stringify([(plan.monsters[k].palette || []).map((c) => c.toLowerCase()), crustsOf(plan.monsters[k].variant, words)]);
    // the base's crusts: what the base-palette wearers most often carry (usually none)
    const baseWearers = g.keys.filter((k) => base && JSON.stringify(plan.monsters[k].palette.map((c) => c.toLowerCase())) === JSON.stringify(base.map((c) => c.toLowerCase())));
    const counts = {};
    for (const k of baseWearers) { const c = JSON.stringify(crustsOf(plan.monsters[k].variant, words)); counts[c] = (counts[c] || 0) + 1; }
    const baseCrusts = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "[]";
    const baseSig = base ? JSON.stringify([base.map((c) => c.toLowerCase()), JSON.parse(baseCrusts)]) : null;
    const variants = {};
    const sigToId = {};
    for (const k of g.keys) {
      const m = plan.monsters[k];
      let variant;
      if (!g.unique && sig(k) !== baseSig) {
        variant = sigToId[sig(k)] ||= k;
        const v = (variants[variant] ||= { palette: m.palette, base_palette: base, crusts: crustsOf(m.variant, words), text: m.variant, monsters: [] });
        v.monsters.push(k);
      }
      const tint = variant && !crustsOf(m.variant, words).length ? fallbackTint(base[0], m.palette[0]) : undefined;
      monsters[k] = { glb, h: m.height_m, ...(variant ? { variant } : {}), ...(tint ? { tint } : {}) };
    }
    // /?bestiary shows a look as a base wearer of middling height
    const hs = g.keys.map((k) => monsters[k].h).sort((a, b) => a - b), mid = hs[Math.floor(hs.length / 2)];
    const plain = g.keys.filter((k) => !monsters[k].variant);
    const pool = plain.length ? plain : g.keys;
    const show = pool.reduce((best, k) => (Math.abs(monsters[k].h - mid) < Math.abs(monsters[best].h - mid) ? k : best), pool[0]);
    glbs[glb] = { look: g.look, plan: g.plan, show, monsters: g.keys, variants };
  }
  return { about: "GENERATED by tools/data/bestiary_looks.mjs from tools/data/bestiary_plan.json -- do not edit", glbs, monsters };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/bestiary_plan.json"), "utf8"));
  const out = looksFromPlan(plan);
  const file = path.join(ROOT, "client/src/creature-looks.json");
  fs.writeFileSync(file + ".tmp", JSON.stringify(out, null, 1) + "\n");
  fs.renameSync(file + ".tmp", file);
  const nv = Object.values(out.glbs).reduce((a, g) => a + Object.keys(g.variants).length, 0);
  console.log(`${Object.keys(out.monsters).length} monsters, ${Object.keys(out.glbs).length} GLBs, ${nv} palette variants -> ${path.relative(ROOT, file)}`);
}
