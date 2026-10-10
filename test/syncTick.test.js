const { test } = require('node:test');
const assert = require('node:assert');
const createSyncTick = require('../utils/syncTick');

test('skips when idle', async () => {
  let calls = 0;
  const tick = createSyncTick({
    isActive: () => false,
    syncApps: async () => void calls++,
    idleWindowMs: 1000,
  });
  assert.strictEqual(await tick(), 'idle');
  assert.strictEqual(calls, 0);
});

test('passes the idle window to isActive and runs when active', async () => {
  let calls = 0;
  let seen;
  const tick = createSyncTick({
    isActive: (w) => ((seen = w), true),
    syncApps: async () => void calls++,
    idleWindowMs: 1234,
  });
  assert.strictEqual(await tick(), 'ran');
  assert.strictEqual(calls, 1);
  assert.strictEqual(seen, 1234);
});

test('skips while a previous run is in flight, then resumes', async () => {
  let calls = 0;
  let release;
  const tick = createSyncTick({
    isActive: () => true,
    syncApps: () => {
      calls++;
      return new Promise((r) => (release = r));
    },
    idleWindowMs: 1000,
  });
  const first = tick();
  assert.strictEqual(await tick(), 'in-flight');
  assert.strictEqual(calls, 1);
  release();
  assert.strictEqual(await first, 'ran');
  const next = tick();
  release();
  assert.strictEqual(await next, 'ran');
  assert.strictEqual(calls, 2);
});

test('errors are reported and clear the in-flight flag', async () => {
  const errors = [];
  let fail = true;
  const tick = createSyncTick({
    isActive: () => true,
    syncApps: async () => {
      if (fail) throw new Error('boom');
    },
    idleWindowMs: 1000,
    onError: (e) => errors.push(e.message),
  });
  assert.strictEqual(await tick(), 'error');
  assert.deepStrictEqual(errors, ['boom']);
  fail = false;
  assert.strictEqual(await tick(), 'ran');
});
