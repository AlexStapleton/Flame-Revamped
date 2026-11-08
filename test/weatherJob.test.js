const { test } = require('node:test');
const assert = require('node:assert');
const createWeatherTick = require('../utils/weatherTick');
const { createRefreshWeatherIfStale, WEATHER_INTERVAL_MS } = require('../utils/refreshWeatherIfStale');
const { storeWeather } = require('../utils/getExternalWeather');

const IDLE_WINDOW = 5 * 60 * 1000;
const KEYED = async () => ({ WEATHER_API_KEY: 'key' });

// A stand-in for a Weather row: a getDataValue() accessor, the fields, and a
// recorded update().
const fakeRow = (fields = {}) => {
  const row = {
    externalLastUpdate: '2026-11-08 10:00',
    updatedAt: new Date(),
    forecast: '[{"date":"2026-11-08"}]',
    updates: [],
    getDataValue(name) {
      return this[name];
    },
    async update(next) {
      this.updates.push(next);
      Object.assign(this, next);
      return this;
    },
    ...fields,
  };
  return row;
};

test('scheduled tick does not fetch while nobody is viewing', async () => {
  const seen = [];
  const tick = createWeatherTick({
    isActive: (windowMs) => {
      seen.push(windowMs);
      return false;
    },
    idleWindowMs: IDLE_WINDOW,
    loadConfig: KEYED,
    refresh: async () => assert.fail('must not fetch while idle'),
  });
  assert.strictEqual(await tick(), 'idle');
  assert.deepStrictEqual(seen, [IDLE_WINDOW]);
});

test('scheduled tick fetches while a dashboard is active', async () => {
  let calls = 0;
  const tick = createWeatherTick({
    isActive: () => true,
    idleWindowMs: IDLE_WINDOW,
    loadConfig: KEYED,
    refresh: async () => {
      calls++;
    },
  });
  assert.strictEqual(await tick(), 'ran');
  assert.strictEqual(calls, 1);
});

test('scheduled tick does nothing without a weather key', async () => {
  const tick = createWeatherTick({
    isActive: () => true,
    idleWindowMs: IDLE_WINDOW,
    loadConfig: async () => ({ WEATHER_API_KEY: '' }),
    refresh: async () => assert.fail('no key, no fetch'),
  });
  assert.strictEqual(await tick(), 'no-key');
});

test('scheduled tick reports errors and does not throw', async () => {
  const errors = [];
  const tick = createWeatherTick({
    isActive: () => true,
    idleWindowMs: IDLE_WINDOW,
    loadConfig: KEYED,
    refresh: async () => {
      throw new Error('boom');
    },
    onError: (err) => errors.push(err.message),
  });
  assert.strictEqual(await tick(), 'error');
  assert.deepStrictEqual(errors, ['boom']);
});

test('view-triggered refresh runs when stored weather is stale', async () => {
  let refreshes = 0;
  const refreshIfStale = createRefreshWeatherIfStale({
    loadConfig: KEYED,
    findLatest: async () => fakeRow({ updatedAt: new Date(Date.now() - WEATHER_INTERVAL_MS - 1000) }),
    refresh: async () => {
      refreshes++;
    },
    lastAttemptAt: () => 0,
  });
  assert.strictEqual(await refreshIfStale(), true);
  assert.strictEqual(refreshes, 1);
});

test('view-triggered refresh skips fresh weather and a recent attempt', async () => {
  let refreshes = 0;
  const refresh = async () => {
    refreshes++;
  };
  const fresh = createRefreshWeatherIfStale({
    loadConfig: KEYED,
    findLatest: async () => fakeRow(),
    refresh,
    lastAttemptAt: () => 0,
  });
  assert.strictEqual(await fresh(), false);

  // The row is old, but WeatherAPI was asked a moment ago (it may have
  // failed), so do not ask again.
  const recentAttempt = createRefreshWeatherIfStale({
    loadConfig: KEYED,
    findLatest: async () => fakeRow({ updatedAt: new Date(0) }),
    refresh,
    lastAttemptAt: () => Date.now() - 1000,
  });
  assert.strictEqual(await recentAttempt(), false);
  assert.strictEqual(refreshes, 0);
});

test('view-triggered refresh treats a row without forecast as stale', async () => {
  let refreshes = 0;
  const refreshIfStale = createRefreshWeatherIfStale({
    loadConfig: KEYED,
    findLatest: async () => fakeRow({ forecast: null }),
    refresh: async () => {
      refreshes++;
    },
    lastAttemptAt: () => 0,
  });
  await refreshIfStale();
  assert.strictEqual(refreshes, 1);
});

test('concurrent view-triggered refreshes share one fetch', async () => {
  let refreshes = 0;
  let openGate;
  const gate = new Promise((resolve) => {
    openGate = resolve;
  });
  const refreshIfStale = createRefreshWeatherIfStale({
    loadConfig: KEYED,
    findLatest: async () => fakeRow({ updatedAt: new Date(0) }),
    refresh: async () => {
      refreshes++;
      await gate; // hold the fetch open so the second call overlaps it
    },
    lastAttemptAt: () => 0,
  });
  const a = refreshIfStale();
  const b = refreshIfStale();
  openGate();
  await Promise.all([a, b]);
  assert.strictEqual(refreshes, 1);
});

test('view-triggered refresh does nothing without a weather key', async () => {
  const refreshIfStale = createRefreshWeatherIfStale({
    loadConfig: async () => ({ WEATHER_API_KEY: '' }),
    findLatest: async () => fakeRow({ updatedAt: new Date(0) }),
    refresh: async () => assert.fail('no key, no fetch'),
  });
  assert.strictEqual(await refreshIfStale(), false);
});

const fakeModel = (existing) => {
  const created = [];
  return {
    created,
    findOne: async () => existing,
    create: async (fields) => {
      created.push(fields);
      return fakeRow(fields);
    },
  };
};

test('storeWeather skips the write when last_updated is unchanged', async () => {
  const existing = fakeRow({ externalLastUpdate: '2026-11-08 10:00' });
  const Model = fakeModel(existing);
  const result = await storeWeather(
    { externalLastUpdate: '2026-11-08 10:00', tempC: 3 },
    { Model }
  );
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.row, existing);
  assert.deepStrictEqual(existing.updates, []);
  assert.deepStrictEqual(Model.created, []);
});

test('storeWeather updates the row when last_updated changed', async () => {
  const existing = fakeRow({ externalLastUpdate: '2026-11-08 10:00' });
  const result = await storeWeather(
    { externalLastUpdate: '2026-11-08 10:15', tempC: 4 },
    { Model: fakeModel(existing) }
  );
  assert.strictEqual(result.changed, true);
  assert.strictEqual(existing.updates.length, 1);
  assert.strictEqual(existing.tempC, 4);
});

test('storeWeather writes when the stored row has no forecast yet', async () => {
  const existing = fakeRow({ externalLastUpdate: '2026-11-08 10:00', forecast: null });
  const result = await storeWeather(
    { externalLastUpdate: '2026-11-08 10:00', tempC: 3 },
    { Model: fakeModel(existing) }
  );
  assert.strictEqual(result.changed, true);
  assert.strictEqual(existing.updates.length, 1);
});

test('storeWeather creates the first row when none exists', async () => {
  const Model = fakeModel(null);
  const result = await storeWeather({ externalLastUpdate: 'x', tempC: 1 }, { Model });
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(Model.created, [{ externalLastUpdate: 'x', tempC: 1 }]);
});
