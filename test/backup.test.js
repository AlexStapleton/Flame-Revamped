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

const { validateBackup, SCHEMA_VERSION } = require('../utils/backup/validate');

test('validateBackup accepts a well-formed envelope', () => {
  const env = { flameBackup: true, schemaVersion: SCHEMA_VERSION, data: {} };
  assert.deepStrictEqual(validateBackup(env), { ok: true });
});

test('validateBackup rejects non-objects', () => {
  assert.strictEqual(validateBackup(null).ok, false);
  assert.strictEqual(validateBackup('nope').ok, false);
});

test('validateBackup rejects a missing flameBackup marker', () => {
  const res = validateBackup({ schemaVersion: SCHEMA_VERSION, data: {} });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /flame/i);
});

test('validateBackup rejects an unsupported schemaVersion', () => {
  const res = validateBackup({ flameBackup: true, schemaVersion: 999, data: {} });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /version/i);
});

test('validateBackup rejects a missing data object', () => {
  const res = validateBackup({ flameBackup: true, schemaVersion: SCHEMA_VERSION });
  assert.strictEqual(res.ok, false);
});

const { readJsonArray } = require('../utils/backup/serialize');

test('readJsonArray returns [] when a file is missing or unparseable', () => {
  assert.deepStrictEqual(readJsonArray('does/not/exist.json', 'themes'), []);
});
