const { test } = require('node:test');
const assert = require('node:assert');
const { Op } = require('sequelize');
const clearWeatherData = require('../utils/clearWeatherData');

// Fake model that records the findOne ordering and destroy filter.
const fakeModel = (rows) => {
  const calls = { order: null, destroyed: null };
  return {
    calls,
    async findOne({ order }) {
      calls.order = order;
      // Mirror a DB: the ordering decides which row comes back first.
      const [[field, dir]] = order;
      const sorted = [...rows].sort((a, b) =>
        dir === 'DESC' ? b[field] - a[field] : a[field] - b[field]
      );
      return sorted[0] || null;
    },
    async destroy({ where }) {
      calls.destroyed = where.id[Op.lt];
      return 0;
    },
  };
};

test('keeps the highest-id row and orders by id, not createdAt', async () => {
  // Legacy rows: the newest-created row is not the highest id.
  const Model = fakeModel([
    { id: 7, createdAt: new Date('2026-01-01') },
    { id: 9, createdAt: new Date('2025-06-01') },
  ]);
  await clearWeatherData({ Model });
  assert.deepStrictEqual(Model.calls.order, [['id', 'DESC']]);
  assert.strictEqual(Model.calls.destroyed, 9);
});

test('does nothing when there are no rows', async () => {
  const Model = fakeModel([]);
  await clearWeatherData({ Model });
  assert.strictEqual(Model.calls.destroyed, null);
});
