const { test } = require('node:test');
const assert = require('node:assert');
const runStatusChecks = require('../utils/runStatusChecks');

const { needsUpdate } = runStatusChecks;

test('needsUpdate is true when the probed status differs from the stored one', () => {
  assert.strictEqual(needsUpdate({ status: 'offline' }, 'online'), true);
  assert.strictEqual(needsUpdate({ status: 'online' }, 'offline'), true);
});

test('needsUpdate is false when the status is unchanged (no write churn)', () => {
  assert.strictEqual(needsUpdate({ status: 'online' }, 'online'), false);
  assert.strictEqual(needsUpdate({ status: 'offline' }, 'offline'), false);
});

test('needsUpdate is true for the first check when no status was stored yet', () => {
  assert.strictEqual(needsUpdate({ status: null }, 'online'), true);
  assert.strictEqual(needsUpdate({ status: undefined }, 'offline'), true);
});
