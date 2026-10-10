const { test } = require('node:test');
const assert = require('node:assert');
const { isDangerousUrl } = require('../utils/urlSafety');
const { validateBackup } = require('../utils/backup/validate');

const dangerous = [
  'javascript:alert(1)',
  'JavaScript://%0aalert(1)',
  '  javascript:x',
  '\x01javascript:x',
  'java\tscript:x',
  'java\nscript:x',
  'vbscript:x',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'blob:https://x/abc',
];
const safe = [
  'https://x',
  'http://x',
  'steam://run/1',
  'ssh://host',
  'mailto:a@b',
  'example.com',
  'localhost:8080',
  '/relative',
  '',
];

for (const u of dangerous) {
  test(`dangerous: ${JSON.stringify(u)}`, () => {
    assert.strictEqual(isDangerousUrl(u), true);
  });
}
for (const u of safe) {
  test(`safe: ${JSON.stringify(u)}`, () => {
    assert.strictEqual(isDangerousUrl(u), false);
  });
}

test('non-strings are not classified as dangerous (left to model validation)', () => {
  assert.strictEqual(isDangerousUrl(undefined), false);
  assert.strictEqual(isDangerousUrl(null), false);
  assert.strictEqual(isDangerousUrl(42), false);
});

const backup = (data) => ({ flameBackup: true, schemaVersion: 1, data });

test('validateBackup rejects a javascript: app url', () => {
  const r = validateBackup(
    backup({ apps: [{ name: 'a', url: 'javascript://%0aalert(1)' }] })
  );
  assert.strictEqual(r.ok, false);
});

test('validateBackup rejects a dangerous bookmark url', () => {
  const r = validateBackup(
    backup({ bookmarks: [{ name: 'b', url: 'data:text/html,x' }] })
  );
  assert.strictEqual(r.ok, false);
});

test('validateBackup accepts safe urls', () => {
  const r = validateBackup(
    backup({
      apps: [{ name: 'a', url: 'steam://run/1' }],
      bookmarks: [{ name: 'b', url: 'https://x' }],
    })
  );
  assert.strictEqual(r.ok, true);
});
