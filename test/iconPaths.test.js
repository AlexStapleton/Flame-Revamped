const { test } = require('node:test');
const assert = require('node:assert');
const { toMdiName, iconPathsFor } = require('../utils/iconPaths');
const App = require('../models/App');
const Category = require('../models/Category');
const getAllApps = require('../controllers/apps/getAllApps');
const getAllCategories = require('../controllers/categories/getAllCategories');
const loadConfig = require('../utils/loadConfig');

const fake = () => ({ mdiDocker: 'M1', mdiHomeAssistant: 'M2', mdiNotString: 5 });

test('toMdiName mirrors the client iconParser', () => {
  assert.strictEqual(toMdiName('docker'), 'mdiDocker');
  assert.strictEqual(toMdiName('home-assistant'), 'mdiHomeAssistant');
  assert.strictEqual(toMdiName('router-wireless'), 'mdiRouterWireless');
});

test('toMdiName rejects URLs, uploads and malformed names', () => {
  for (const v of [
    '',
    null,
    undefined,
    5,
    'https://example.com/icon.png',
    'http://nas/icon.svg',
    'dashboard:plex',
    '1700000000-logo.png',
    'a--b',
    '-docker',
    'docker-',
  ]) {
    assert.strictEqual(toMdiName(v), null, String(v));
  }
});

test('iconPathsFor dedupes, skips non-MDI values and omits unknown names', () => {
  const out = iconPathsFor(
    ['docker', 'docker', 'home-assistant', 'nope', 'not-string', 'https://x.com/a.svg', ''],
    fake
  );
  assert.deepStrictEqual(out, { mdiDocker: 'M1', mdiHomeAssistant: 'M2' });
});

test('iconPathsFor does not load @mdi/js when there is nothing to resolve', () => {
  let loaded = false;
  const out = iconPathsFor(['https://x.com/a.png', ''], () => {
    loaded = true;
    return {};
  });
  assert.deepStrictEqual(out, {});
  assert.strictEqual(loaded, false);
});

const capture = () => {
  const res = { body: null };
  res.status = () => res;
  res.setHeader = () => res;
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
};

const row = (obj) => ({ ...obj, get: () => JSON.parse(JSON.stringify(obj)) });

test('GET /api/apps includes the paths for its icons', async (t) => {
  loadConfig.setCache({ useOrdering: 'orderId' });
  t.mock.method(App, 'findAll', async () => [
    row({ id: 1, name: 'Docker', icon: 'docker' }),
    row({ id: 2, name: 'Pic', icon: 'https://example.com/a.png' }),
  ]);
  const res = capture();
  await getAllApps({ isAuthenticated: false }, res, assert.ifError);
  assert.deepStrictEqual(Object.keys(res.body.icons), ['mdiDocker']);
  assert.strictEqual(typeof res.body.icons.mdiDocker, 'string');
  loadConfig.clearCache();
});

test('GET /api/categories omits icons of bookmarks hidden from guests', async (t) => {
  loadConfig.setCache({ useOrdering: 'orderId' });
  t.mock.method(Category, 'findAll', async () => [
    row({
      id: 1,
      name: 'Media',
      bookmarks: [
        { id: 1, name: 'Plex', icon: 'plex', isPublic: 1 },
        { id: 2, name: 'Secret', icon: 'shield-lock', isPublic: 0 },
      ],
    }),
  ]);
  const res = capture();
  await getAllCategories({ isAuthenticated: false }, res, assert.ifError);
  assert.deepStrictEqual(Object.keys(res.body.icons), ['mdiPlex']);
  assert.strictEqual(res.body.data[0].bookmarks.length, 1);
  loadConfig.clearCache();
});
