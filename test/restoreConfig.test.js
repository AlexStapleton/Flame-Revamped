const { test } = require('node:test');
const assert = require('node:assert');
const File = require('../utils/File');
const loadConfig = require('../utils/loadConfig');
const fs = require('fs');
const path = require('path');
const { restoreConfig, writeCustomCss } = require('../utils/backup/restore');

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

test('writeCustomCss persists to both public/ and data/ so a restart keeps it', (t) => {
  const writeFileSync = t.mock.method(fs, 'writeFileSync', () => {});

  writeCustomCss('body { color: red; }');

  const targets = writeFileSync.mock.calls.map((c) => c.arguments[0]);
  assert.strictEqual(targets.length, 2);
  assert.ok(
    targets.some((p) => p.endsWith(path.join('public', 'flame.css'))),
    'public/flame.css not written'
  );
  assert.ok(targets.includes('data/flame.css'), 'data/flame.css not written');
  for (const call of writeFileSync.mock.calls) {
    assert.strictEqual(call.arguments[1], 'body { color: red; }');
  }
});

test('writeCustomCss writes an empty string for a non-string value', (t) => {
  const writeFileSync = t.mock.method(fs, 'writeFileSync', () => {});
  writeCustomCss(undefined);
  for (const call of writeFileSync.mock.calls) {
    assert.strictEqual(call.arguments[1], '');
  }
});
