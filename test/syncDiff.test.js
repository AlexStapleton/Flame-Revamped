const { test } = require('node:test');
const assert = require('node:assert');
const { computeSyncPlan } = require('../utils/syncDiff');

// Same icon rules as useDocker.
const dockerIconRule = {
  forUpdate: (item, app) =>
    item.icon === 'custom' || (item.icon === 'docker' && app.icon != 'docker')
      ? undefined
      : item.icon,
  forCreate: (item) => (item.icon === 'custom' ? 'docker' : item.icon),
};

const app = (o) => ({
  id: 1,
  name: 'a',
  url: 'http://a',
  icon: 'docker',
  isPinned: true,
  source: 'docker',
  ...o,
});
const opts = { source: 'docker', iconRule: dockerIconRule };

test('unchanged app produces no writes', () => {
  const plan = computeSyncPlan(
    [app()],
    [{ name: 'a', url: 'http://a', icon: 'docker' }],
    opts
  );
  assert.deepStrictEqual(plan, { creates: [], updates: [], unpins: [] });
});

test('changed url updates only the changed field', () => {
  const plan = computeSyncPlan(
    [app()],
    [{ name: 'a', url: 'http://new', icon: 'docker' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, [
    { id: 1, fields: { url: 'http://new' } },
  ]);
});

test('new app is created pinned with source', () => {
  const plan = computeSyncPlan(
    [],
    [{ name: 'b', url: 'http://b', icon: 'x' }],
    opts
  );
  assert.deepStrictEqual(plan.creates, [
    { name: 'b', url: 'http://b', icon: 'x', isPinned: true, source: 'docker' },
  ]);
});

test('create maps icon "custom" to "docker" (docker rule)', () => {
  const plan = computeSyncPlan(
    [],
    [{ name: 'b', url: 'http://b', icon: 'custom' }],
    opts
  );
  assert.strictEqual(plan.creates[0].icon, 'docker');
});

test('unpinStopped unpins only same-source pinned apps not discovered', () => {
  const existing = [
    app({ id: 1, name: 'gone' }),
    app({ id: 2, name: 'kept' }),
    app({ id: 3, name: 'already', isPinned: false }),
    app({ id: 4, name: 'manual', source: null }),
    app({ id: 5, name: 'k8s', source: 'kubernetes' }),
  ];
  const plan = computeSyncPlan(
    existing,
    [{ name: 'kept', url: 'http://a', icon: 'docker' }],
    { ...opts, unpinStopped: true }
  );
  assert.deepStrictEqual(plan.unpins, [1]);
});

test('without unpinStopped nothing is unpinned', () => {
  const plan = computeSyncPlan([app()], [], opts);
  assert.deepStrictEqual(plan.unpins, []);
});

test('a discovered app is re-pinned if it was unpinned', () => {
  const plan = computeSyncPlan(
    [app({ isPinned: false })],
    [{ name: 'a', url: 'http://a', icon: 'docker' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, [{ id: 1, fields: { isPinned: true } }]);
});

test('adoption: null-source match gets source set', () => {
  const plan = computeSyncPlan(
    [app({ source: null })],
    [{ name: 'a', url: 'http://a', icon: 'docker' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, [
    { id: 1, fields: { source: 'docker' } },
  ]);
});

test('a null-source app that is not discovered is never unpinned', () => {
  const plan = computeSyncPlan([app({ source: null })], [], {
    ...opts,
    unpinStopped: true,
  });
  assert.deepStrictEqual(plan.unpins, []);
});

test('icon "custom" does not override an existing icon', () => {
  const plan = computeSyncPlan(
    [app({ icon: 'mine' })],
    [{ name: 'a', url: 'http://a', icon: 'custom' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, []);
});

test('default "docker" icon does not override an existing custom icon', () => {
  const plan = computeSyncPlan(
    [app({ icon: 'mine' })],
    [{ name: 'a', url: 'http://a', icon: 'docker' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, []);
});

test('an explicit label icon overrides the existing icon', () => {
  const plan = computeSyncPlan(
    [app({ icon: 'mine' })],
    [{ name: 'a', url: 'http://a', icon: 'nginx' }],
    opts
  );
  assert.deepStrictEqual(plan.updates, [{ id: 1, fields: { icon: 'nginx' } }]);
});

test('default icon rule (kubernetes) always uses the discovered icon', () => {
  const plan = computeSyncPlan(
    [app({ icon: 'mine', source: 'kubernetes' })],
    [{ name: 'a', url: 'http://a', icon: 'kubernetes' }],
    { source: 'kubernetes' }
  );
  assert.deepStrictEqual(plan.updates, [
    { id: 1, fields: { icon: 'kubernetes' } },
  ]);
});

test('docker and kubernetes passes do not unpin each other', () => {
  const existing = [
    app({ id: 1, name: 'd', source: 'docker' }),
    app({ id: 2, name: 'k', source: 'kubernetes' }),
  ];
  const k = computeSyncPlan(existing, [], {
    source: 'kubernetes',
    unpinStopped: true,
  });
  assert.deepStrictEqual(k.unpins, [2]);
  const d = computeSyncPlan(existing, [], { ...opts, unpinStopped: true });
  assert.deepStrictEqual(d.unpins, [1]);
});
