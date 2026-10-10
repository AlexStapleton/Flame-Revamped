const { test } = require('node:test');
const assert = require('node:assert');
const { createStatusTick } = require('../utils/statusTick');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test('a tick while the previous run is still in flight is skipped', async () => {
  let runs = 0;
  let gate = deferred();
  const tick = createStatusTick({
    isActive: () => true,
    run: () => {
      runs++;
      return gate.promise;
    },
    idleWindowMs: 1000,
  });

  const first = tick();
  await tick(); // previous run still going => skipped
  assert.strictEqual(runs, 1);

  gate.resolve();
  await first;

  gate = deferred();
  const third = tick(); // previous run finished => runs again
  assert.strictEqual(runs, 2);
  gate.resolve();
  await third;
});

test('a run that rejects is reported and clears the in-flight flag', async () => {
  const errors = [];
  let calls = 0;
  const tick = createStatusTick({
    isActive: () => true,
    run: async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    },
    idleWindowMs: 1000,
    onError: (err) => errors.push(err.message),
  });

  await tick();
  assert.deepStrictEqual(errors, ['boom']);
  await tick();
  assert.strictEqual(calls, 2);
});

test('idle pause: no run when the dashboard was not viewed within the window', async () => {
  let runs = 0;
  let windowSeen;
  const tick = createStatusTick({
    isActive: (ms) => {
      windowSeen = ms;
      return false;
    },
    run: async () => {
      runs++;
    },
    idleWindowMs: 300000,
  });

  await tick();
  assert.strictEqual(runs, 0);
  assert.strictEqual(windowSeen, 300000);
});
