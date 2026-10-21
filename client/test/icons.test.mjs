// Lamplight stroke icons: the shape of the svg the HUD inlines, and the
// fallbacks that keep a missing name or job from blanking a panel.
//   node --test          (from client/ — Node imports the .ts directly)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LP_PATHS, strokeIcon, lpIcon, jobIcon, abilityGlyph, abilityStrokeIcon, itemStrokeIcon } from "../src/icons.ts";

const ABILITIES = JSON.parse(readFileSync(new URL("../../shared/data/abilities.json", import.meta.url), "utf8"));

const pathOf = (svg) => svg.match(/<path d="([^"]*)"/)[1];

test("every job emblem is a currentColor stroke svg with its own path", () => {
  const jobs = ["PLD", "WHM", "BLM", "MNK", "SAM", "DRK"];
  const paths = jobs.map((j) => {
    const svg = jobIcon(j);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /fill="none"/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.equal(pathOf(svg), LP_PATHS[`job_${j}`]);
    return pathOf(svg);
  });
  assert.equal(new Set(paths).size, jobs.length);
});

test("a job the design never drew falls back to the shield", () => {
  assert.equal(pathOf(jobIcon("XYZ")), LP_PATHS.shield);
});

test("strokeIcon embeds the path verbatim, implicit command repetition included", () => {
  const d = "M19 4 9 14M19 4h-4";
  assert.equal(pathOf(strokeIcon(d)), d);
  const svg = strokeIcon(d, 15, 1.8);
  assert.match(svg, /width="15" height="15"/);
  assert.match(svg, /stroke-width="1.8"/);
});

test("an ability the table does not know reads the effect before the kind", () => {
  assert.notEqual(abilityStrokeIcon({ effect: "revive" }), abilityStrokeIcon({}));
  assert.equal(pathOf(abilityStrokeIcon({ effect: "revive" })), LP_PATHS.crystal);
  assert.equal(pathOf(abilityStrokeIcon({ effect: "heal", kind: "spell" })), LP_PATHS.cure);
  assert.equal(pathOf(abilityStrokeIcon({ kind: "ws" })), LP_PATHS.sword);
  assert.equal(pathOf(abilityStrokeIcon({ name: "Sentinel", effect: "buff_def" })), LP_PATHS.sentinel);
  assert.equal(pathOf(abilityStrokeIcon(null)), LP_PATHS.flash);
});

test("an unknown icon name falls back to flash without throwing", () => {
  assert.equal(pathOf(lpIcon("nope")), LP_PATHS.flash);
});

test("a design-named ability draws its own icon before the effect rules", () => {
  // Flash shares Provoke's enmity effect, and Radiant Blade Fast Blade's ws kind
  assert.equal(pathOf(abilityStrokeIcon({ id: "flash", name: "Flash", kind: "ja", effect: "enmity" })), LP_PATHS.flash);
  assert.equal(pathOf(abilityStrokeIcon({ id: "provoke", name: "Provoke", kind: "ja", effect: "enmity" })), LP_PATHS.provoke);
  assert.equal(pathOf(abilityStrokeIcon({ id: "radiant_blade", name: "Radiant Blade", kind: "ws", element: "radiance" })), LP_PATHS.radiant);
  assert.equal(pathOf(abilityStrokeIcon({ id: "shield_bash", kind: "ja", effect: "stun" })), LP_PATHS.bash);
  // a payload without its key still matches by name
  assert.equal(pathOf(abilityStrokeIcon({ name: "Flash", effect: "enmity" })), LP_PATHS.flash);
  assert.equal(pathOf(abilityStrokeIcon({ name: "Tachi: Enpi" })), LP_PATHS.tachi_enpi);
  assert.equal(pathOf(abilityStrokeIcon({ name: "Saint's Edge" })), LP_PATHS.saints_edge);
  assert.equal(pathOf(abilityStrokeIcon({ name: "Shadow Scythe" })), LP_PATHS.gloom_scythe);
});

test("a ranked spell draws its family's picture with its rank's ticks", () => {
  assert.deepEqual(abilityGlyph({ id: "stone" }), { glyph: "stone", rank: 1 });
  assert.deepEqual(abilityGlyph({ id: "stone_iv" }), { glyph: "stone", rank: 4 });
  assert.deepEqual(abilityGlyph({ name: "Cure III" }), { glyph: "cure", rank: 3 });
  assert.deepEqual(abilityGlyph({ id: "radiant_smite_ii" }), { glyph: "radiant_smite", rank: 2 });
  assert.equal(pathOf(abilityStrokeIcon({ id: "stone" })), LP_PATHS.stone);
  assert.ok(pathOf(abilityStrokeIcon({ id: "stone_ii" })).startsWith(LP_PATHS.stone));
  assert.notEqual(pathOf(abilityStrokeIcon({ id: "stone_ii" })), pathOf(abilityStrokeIcon({ id: "stone_iii" })));
  // the same spell under two jobs' names is the same picture on purpose
  assert.equal(abilityGlyph({ id: "warding_chant_ii" }).glyph, abilityGlyph({ id: "protect_ii" }).glyph);
});

test("every ability in abilities.json has its own picture, and no two on one job share one", () => {
  const byJob = new Map();
  for (const [id, ab] of Object.entries(ABILITIES)) {
    const { glyph } = abilityGlyph({ id, ...ab });
    assert.ok(LP_PATHS[glyph], `${id} draws an unknown glyph ${glyph}`);
    // the name alone (a buff tile) finds the same picture as the key
    assert.deepEqual(abilityGlyph({ name: ab.name }), abilityGlyph({ id }), `${ab.name} by name`);
    const d = pathOf(abilityStrokeIcon({ id, ...ab }));
    const seen = byJob.get(ab.job) ?? new Map();
    assert.ok(!seen.has(d), `${ab.job}: ${id} and ${seen.get(d)} draw the same icon`);
    seen.set(d, id);
    byJob.set(ab.job, seen);
  }
});

test("a consumable's hotbar glyph follows what it does", () => {
  assert.equal(pathOf(itemStrokeIcon("potion", { effect: "heal" })), LP_PATHS.potion);
  assert.equal(pathOf(itemStrokeIcon("hi_potion", { effect: "heal" })), LP_PATHS.potion);
  assert.equal(pathOf(itemStrokeIcon("ether", { effect: "mp" })), LP_PATHS.droplet);
  assert.equal(pathOf(itemStrokeIcon("antidote", { effect: "cure_poison" })), LP_PATHS.vial);
  assert.equal(pathOf(itemStrokeIcon("fresh_bread", { effect: "heal" })), LP_PATHS.bowl);
  // an unknown item still draws something
  assert.equal(pathOf(itemStrokeIcon("mystery", undefined)), LP_PATHS.potion);
});
