const { test } = require('node:test');
const assert = require('node:assert');
const File = require('../utils/File');
const loadConfig = require('../utils/loadConfig');
const { restoreConfig } = require('../utils/backup/restore');

test('restoreConfig drops unknown keys, applies known ones, preserves secrets', async (t) => {
  loadConfig.setCache({
    customTitle: 'Flame',
    hideSearch: false,
    WEATHER_API_KEY: 'live-secret',
  });
  const write = t.mock.method(File.prototype, 'write', () => {});

  await restoreConfig({
    customTitle: 'Imported',
    WEATHER_API_KEY: 'attacker',
    evil: 'x',
  });

  const [written] = write.mock.calls[0].arguments;
  assert.strictEqual(written.customTitle, 'Imported');
  assert.strictEqual(written.hideSearch, false);
  assert.strictEqual(written.WEATHER_API_KEY, 'live-secret');
  assert.ok(!('evil' in written));
  const cached = await loadConfig();
  assert.ok(!('evil' in cached));
  loadConfig.clearCache();
});
