const { test } = require('node:test');
const assert = require('node:assert');
const { maskConfigForViewer } = require('../controllers/config/getConfig');

// Guards H2: the weather API key must never reach unauthenticated clients.
// Weather is login-only, so guests don't even get the "configured" signal or
// the location.

test('hides the weather key and location from unauthenticated viewers', () => {
  const cfg = { WEATHER_API_KEY: 'super-secret', lat: 52.37, long: 4.89, hideSearch: false };
  const out = maskConfigForViewer(cfg, false);
  assert.strictEqual(out.WEATHER_API_KEY, '');
  assert.strictEqual(out.lat, 0);
  assert.strictEqual(out.long, 0);
  assert.strictEqual(out.hideSearch, false);
  const admin = maskConfigForViewer(cfg, true);
  assert.strictEqual(admin.lat, 52.37);
});

test('returns the real key for authenticated viewers', () => {
  const cfg = { WEATHER_API_KEY: 'super-secret' };
  assert.strictEqual(
    maskConfigForViewer(cfg, true).WEATHER_API_KEY,
    'super-secret'
  );
});

test('masks an absent key to empty string for anon (widget stays hidden)', () => {
  assert.strictEqual(
    maskConfigForViewer({ WEATHER_API_KEY: '' }, false).WEATHER_API_KEY,
    ''
  );
});

test('does not mutate the source config (cache stays intact)', () => {
  const cfg = { WEATHER_API_KEY: 'secret' };
  maskConfigForViewer(cfg, false);
  assert.strictEqual(cfg.WEATHER_API_KEY, 'secret');
});
