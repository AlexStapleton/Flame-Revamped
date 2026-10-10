const { test } = require('node:test');
const assert = require('node:assert');
const App = require('../models/App');
const getSingleApp = require('../controllers/apps/getSingleApp');

const row = {
  id: 1,
  name: 'Sonarr',
  url: 'http://10.0.0.2:8989',
  status: 'online',
  statusCheckedAt: '2026-06-06T00:00:00Z',
  statusCheckEnabled: 1,
  statusCheckUrl: 'http://10.0.0.2:8989/health',
};
const fakeApp = { ...row, get: () => ({ ...row }) };

const run = async (t, isAuthenticated) => {
  t.mock.method(App, 'findOne', async () => fakeApp);
  let body;
  const res = { status: () => ({ json: (b) => (body = b) }) };
  await getSingleApp({ isAuthenticated, params: { id: '1' } }, res, assert.ifError);
  return body.data;
};

test('guest gets no status fields', async (t) => {
  const data = await run(t, false);
  assert.strictEqual(data.name, 'Sonarr');
  for (const f of ['status', 'statusCheckedAt', 'statusCheckEnabled', 'statusCheckUrl']) {
    assert.ok(!(f in data), `${f} leaked`);
  }
});

test('authenticated user gets status fields', async (t) => {
  const data = await run(t, true);
  assert.strictEqual(data.status, 'online');
  assert.strictEqual(data.statusCheckUrl, 'http://10.0.0.2:8989/health');
});
