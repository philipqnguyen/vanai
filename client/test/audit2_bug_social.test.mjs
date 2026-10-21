// Audit round two, bug-social: the client halves. hud.ts pulls in Babylon and
// the DOM, so these read its source; each fails on the code as found.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hud = fs.readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
const world = fs.readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../server/lib/vanai/world.rb', import.meta.url), 'utf8');

// the body of hud's closeWindows(), up to the next method
function closeWindowsBody() {
  const start = hud.indexOf('  closeWindows() {');
  assert.ok(start >= 0, 'closeWindows found');
  const end = hud.indexOf('\n  },', start);
  return hud.slice(start, end);
}

test('bug-social-trade-hidden-by-escape: closing every window cancels (or spares) the trade', () => {
  // Escape and every cutscene close all windows through it
  assert.match(world, /e\.code === "Escape"\) \{[^}]*hud\.closeWindows\(\)/);
  assert.match(world, /function startCutscene[\s\S]{0,400}hud\.closeWindows\(\)/);
  const body = closeWindowsBody();
  // hides `.window.on`, win-trade included, and sends nothing: the server's
  // trade stays open and both players are "already trading"
  assert.match(body, /trade/, `closeWindows hides the Trade window without a trade_cancel:\n${body}`);
});

test('bug-social-party-invite-ttl-mismatch: the invite card lasts as long as the server honours it', () => {
  const clientS = Number(hud.match(/const PARTY_INVITE_S = (\d+(?:\.\d+)?);/)?.[1]);
  const serverS = Number(server.match(/PARTY_INVITE_TTL = (\d+(?:\.\d+)?)/)?.[1]);
  assert.ok(serverS > 0, 'PARTY_INVITE_TTL found');
  const sentInPayload = /t: "party_invite"[^\n]*ttl:/.test(server);
  assert.ok(sentInPayload || clientS === serverS,
    `the card hides after ${clientS} s; the server accepts for ${serverS} s`);
});
