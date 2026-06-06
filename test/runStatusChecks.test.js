const { test } = require('node:test');
const assert = require('node:assert');
const runStatusChecks = require('../utils/runStatusChecks');

const { needsUpdate, runPool } = runStatusChecks;

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

test('runPool processes every item exactly once', async () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const seen = [];
  await runPool(items, 5, async (n) => {
    seen.push(n);
  });
  assert.strictEqual(seen.length, 25);
  assert.deepStrictEqual([...seen].sort((a, b) => a - b), items);
});

test('runPool never runs more than `limit` workers at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 30 }, (_, i) => i);
  await runPool(items, 4, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak} should be <= 4`);
  assert.ok(peak > 1, 'pool should actually run work concurrently');
});

test('runPool handles an empty list without spawning runners', async () => {
  let called = false;
  await runPool([], 8, async () => {
    called = true;
  });
  assert.strictEqual(called, false);
});
