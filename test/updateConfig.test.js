const { test } = require('node:test');
const assert = require('node:assert');
const { pickKnownKeys } = require('../controllers/config/updateConfig');

// Guards L4: a config update must not be able to inject arbitrary keys.

test('keeps only keys that already exist in the config', () => {
  const existing = { useOrdering: 'orderId', hideApps: false };
  assert.deepStrictEqual(
    pickKnownKeys(existing, { useOrdering: 'name', evilKey: true }),
    { useOrdering: 'name' }
  );
});

test('drops every unknown key', () => {
  assert.deepStrictEqual(pickKnownKeys({ a: 1 }, { x: 1, y: 2 }), {});
});

test('handles a missing or empty body', () => {
  assert.deepStrictEqual(pickKnownKeys({ a: 1 }, undefined), {});
  assert.deepStrictEqual(pickKnownKeys({ a: 1 }, {}), {});
});

test('lets falsy-but-valid values through', () => {
  assert.deepStrictEqual(pickKnownKeys({ a: 1, b: 1 }, { a: 0, b: '' }), {
    a: 0,
    b: '',
  });
});
