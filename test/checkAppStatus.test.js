const { test } = require('node:test');
const assert = require('node:assert');
const { mapResult } = require('../utils/checkAppStatus');

test('any HTTP response (incl. 401/403/500) => online', () => {
  assert.strictEqual(mapResult({ ok: true, statusCode: 200 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 401 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 503 }), 'online');
});

test('a thrown request (timeout/refused/DNS) => offline', () => {
  assert.strictEqual(mapResult({ ok: false }), 'offline');
});
