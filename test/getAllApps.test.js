const { test } = require('node:test');
const assert = require('node:assert');
const { redactAppForGuest } = require('../controllers/apps/getAllApps');

// Guards the admin-only status fields: guests must never see infra health.

test('strips all status fields for guests', () => {
  const app = {
    id: 1,
    name: 'Sonarr',
    url: 'http://10.0.0.2:8989',
    status: 'online',
    statusCheckedAt: '2026-06-06T00:00:00Z',
    statusCheckEnabled: 1,
    statusCheckUrl: 'http://10.0.0.2:8989/health',
  };
  assert.deepStrictEqual(redactAppForGuest(app), {
    id: 1,
    name: 'Sonarr',
    url: 'http://10.0.0.2:8989',
  });
});

test('keeps non-status fields untouched', () => {
  const out = redactAppForGuest({ id: 2, name: 'Radarr', isPinned: true });
  assert.strictEqual(out.name, 'Radarr');
  assert.strictEqual(out.isPinned, true);
});

test('does not mutate the source object', () => {
  const app = { id: 1, status: 'online' };
  redactAppForGuest(app);
  assert.strictEqual(app.status, 'online');
});
