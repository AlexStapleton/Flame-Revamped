const { test } = require('node:test');
const assert = require('node:assert');
const { maskConfigForViewer } = require('../controllers/config/getConfig');

// Guards H2: the weather API key must never reach unauthenticated clients.

test('masks the weather API key for unauthenticated viewers', () => {
  const cfg = { WEATHER_API_KEY: 'super-secret', hideSearch: false };
  const out = maskConfigForViewer(cfg, false);
  assert.strictEqual(out.WEATHER_API_KEY, 'true');
  assert.strictEqual(out.hideSearch, false);
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
