// Audit round two, bug-client: the client halves. world.ts, hud.ts and main.ts
// pull in Babylon and the DOM, so these read their source; each fails on the
// code as found and should pass once its finding is fixed (any of the fixes
// the finding names). The world's halves are in
// server/test/integration/audit2_bug_client_test.rb; the live reproductions
// against a disposable :3002 server are in the audit's scratchpad.
//   node --test test/audit2_bug_client.test.mjs     (from client/)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const world = src('../src/world.ts');
const hud = src('../src/hud.ts');
const main = src('../src/main.ts');
const server = src('../../server/lib/vanai/world.rb');

// the body of `case "<t>":` in world.ts's onMessage, up to the next case label
function caseBody(t) {
  const start = world.indexOf(`case "${t}":`);
  assert.ok(start >= 0, `case "${t}" found`);
  const rest = world.slice(start + t.length + 8);
  const end = rest.search(/\n    case "|\n    default:/);
  return rest.slice(0, end);
}
// a top-level function's body, up to the next line that closes it
function fnBody(text, head) {
  const start = text.indexOf(head);
  assert.ok(start >= 0, `${head} found`);
  return text.slice(start, text.indexOf('\n}\n', start));
}
function rubyDef(name) {
  const start = server.indexOf(`      def ${name}(`);
  assert.ok(start >= 0, `def ${name} found`);
  return server.slice(start, server.indexOf('\n      end\n', start));
}

test('bug-client-death-overlay-never-follows-state: a living `self` takes the death overlay down', () => {
  // the overlay comes down only on a revive event or a zone_change
  const self = caseBody('self');
  const join = rubyDef('join');
  const clientFollows = /hideDeath\(\)/.test(self);
  const worldTells = /revive|alive/.test(join.replace(/#.*$/gm, ''));
  assert.ok(clientFollows || worldTells,
    'a rejoin past VITALS_HOLD (or after a restart) sends self {dead:false} and nothing else; the overlay stays up and Release is dropped');
});

test('bug-client-reconnect-merges-stale-world: a snapshot replaces the zone\'s people and monsters', () => {
  const snap = caseBody('snapshot');
  const prunes = /streamer\.drop|state\.players\.delete|state\.players\.clear|removeMonster|state\.monsters\.(delete|clear)/.test(snap);
  const reconnectHandled = !/connectZone\(onMessage, \(\) => \{ \/\* subscription confirmed; snapshot arrives via join \*\/ \}\)/.test(world);
  assert.ok(prunes || reconnectHandled,
    `the snapshot only upserts, and the subscription's connected() does nothing, so a player who left during a dropped line stays drawn forever:\n${snap}`);
  assert.match(snap, /msg\.zone/, 'the snapshot\'s zone is never compared with the one the client has built');
});

test('bug-client-attacking-flag-never-reconciled: death and a zone change end the client\'s auto-attack', () => {
  const death = caseBody('death');
  const enter = fnBody(world, 'export async function enterZone(');
  assert.ok(/attacking = false/.test(death) || /attacking = false/.test(enter),
    'attacking stays true through death, release and the new zone: battle music, a drawn weapon and every owed cutscene held off');
});

test('bug-client-cutscene-refusal-loop-side-effects: readiness matches the world, or a refused scene puts things back', () => {
  const ready = fnBody(world, 'function cutsceneReady(');
  const refused = caseBody('cutscene_refused');
  const worldsTest = /in_?[cC]ombat|\.engaged|enmity/.test(ready);
  const restores = /myX\s*=|myZ\s*=|restore/.test(refused);
  assert.ok(worldsTest || restores,
    'cutsceneReady ignores enmity (the world refuses with retry every 5 s) and a refusal leaves the player on the scene\'s mark');
});

test('bug-client-rest-inventory-last-response-wins: an older inventory response never overwrites a newer one', () => {
  const refresh = fnBody(main, 'async function refreshInventory(');
  assert.match(refresh, /seq|serial|generation|issued|stamp|latest|inFlight|in_flight/i,
    `GET /game/state is applied on arrival whatever was written since:\n${refresh}`);
});

test('bug-client-job-change-keeps-unequipped-gear: the refreshed inventory redresses your own avatar', () => {
  const start = hud.indexOf('  refreshInventoryLater() {');
  const later = hud.slice(start, hud.indexOf('\n  },', start));
  // or your own player_update's `look` dresses you (the self branch of upsertPlayer)
  const up = fnBody(world, 'function upsertPlayer(');
  const selfBranch = up.slice(up.indexOf('if (p.id === `p${state.self!.charId}`)'), up.indexOf('return;', up.indexOf('if (p.id === `p${state.self!.charId}`)')));
  const selfFromLook = /p\.look/.test(selfBranch);
  assert.ok(/rebuildSelfAvatar/.test(later) || selfFromLook,
    `change_job unequips the weapon but only inventory_dirty carries it, and this never rebuilds the avatar:\n${later}`);
});

test('bug-client-messages-after-zone-change-dropped: nothing the world says after zone_change is lost', () => {
  const enter = fnBody(world, 'export async function enterZone(');
  const unsubscribesFirst = enter.indexOf('disconnectZone()') >= 0 && enter.indexOf('disconnectZone()') < enter.indexOf('await ');
  const travel = rubyDef('milestone_travel'), home = rubyDef('teleport_home');
  const after = (body) => body.indexOf('The crystal carries you') > body.indexOf('teleport_to_crystal(');
  assert.ok(!unsubscribesFirst || (!after(travel) && !after(home)),
    'the fare line and "carries you home" follow zone_change, and the client has no subscription for them');
});
