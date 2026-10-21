// Vanai plays in Google Chrome (browser_gate.ts, Philip 2026-10-15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isChrome } from '../src/browser_gate.ts';

const hints = (...brands) => ({ userAgentData: { brands: brands.map((brand) => ({ brand })) } });
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';

test('Chrome by its brand', () => {
  assert.ok(isChrome(hints('Google Chrome', 'Chromium', 'Not.A/Brand')));
  assert.ok(isChrome(hints('Not)A;Brand', 'Chromium', 'Google Chrome')));
});

test('the other Chromium browsers name themselves and are turned away', () => {
  assert.ok(!isChrome(hints('Microsoft Edge', 'Chromium', 'Not.A/Brand')));
  assert.ok(!isChrome(hints('Opera', 'Chromium', 'Not.A/Brand')));
  assert.ok(!isChrome(hints('Brave', 'Chromium', 'Not.A/Brand')));
});

test('plain Chromium and automation (the QA tools) pass', () => {
  assert.ok(isChrome(hints('Chromium', 'Not.A/Brand')));
  assert.ok(isChrome({ webdriver: true, userAgent: 'anything' }));
});

test('without the hints, the User-Agent string', () => {
  assert.ok(isChrome({ userAgent: `${MAC} Chrome/141.0.0.0 Safari/537.36` }));
  assert.ok(!isChrome({ userAgent: `${MAC} Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0` }));
  assert.ok(!isChrome({ userAgent: `${MAC} Version/26.0 Safari/605.1.15` }), 'Safari');
  assert.ok(!isChrome({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0' }));
  assert.ok(!isChrome({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1' }), 'Chrome on iOS is WebKit');
});
