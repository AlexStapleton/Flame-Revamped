const { test } = require('node:test');
const assert = require('node:assert');
const { SECRET_KEYS, stripSecrets } = require('../utils/backup/secrets');

test('stripSecrets removes WEATHER_API_KEY and keeps everything else', () => {
  const input = { WEATHER_API_KEY: 'abc123', customTitle: 'Flame', appsSameTab: false };
  const out = stripSecrets(input);
  assert.strictEqual(out.WEATHER_API_KEY, undefined);
  assert.strictEqual(out.customTitle, 'Flame');
  assert.strictEqual(out.appsSameTab, false);
});

test('stripSecrets does not mutate its input', () => {
  const input = { WEATHER_API_KEY: 'abc123', customTitle: 'Flame' };
  stripSecrets(input);
  assert.strictEqual(input.WEATHER_API_KEY, 'abc123');
});

test('SECRET_KEYS contains WEATHER_API_KEY', () => {
  assert.ok(SECRET_KEYS.includes('WEATHER_API_KEY'));
});
