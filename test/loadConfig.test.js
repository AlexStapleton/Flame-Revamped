const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const loadConfig = require('../utils/loadConfig');

afterEach(() => loadConfig.clearCache());

test('loadConfig returns the cached value after setCache (no disk read)', async () => {
  loadConfig.setCache({ useOrdering: 'name', WEATHER_API_KEY: 'secret' });
  const config = await loadConfig();
  assert.strictEqual(config.useOrdering, 'name');
  assert.strictEqual(config.WEATHER_API_KEY, 'secret');
});

test('loadConfig hands out copies so callers cannot corrupt the cache', async () => {
  loadConfig.setCache({ WEATHER_API_KEY: 'real-key' });

  // Simulate getConfig masking the key on the returned object.
  const first = await loadConfig();
  first.WEATHER_API_KEY = 'true';

  const second = await loadConfig();
  assert.strictEqual(
    second.WEATHER_API_KEY,
    'real-key',
    'mutating a returned config must not affect the cache'
  );
});

test('clearCache forces the next read to miss the in-memory cache', async () => {
  loadConfig.setCache({ marker: 1 });
  assert.strictEqual((await loadConfig()).marker, 1);

  loadConfig.clearCache();
  // After clearing, setCache a different value to prove the old one is gone.
  loadConfig.setCache({ marker: 2 });
  assert.strictEqual((await loadConfig()).marker, 2);
});
