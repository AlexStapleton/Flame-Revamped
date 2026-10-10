const { test } = require('node:test');
const assert = require('node:assert');
const Category = require('../models/Category');
const loadConfig = require('../utils/loadConfig');
const getSingleCategory = require('../controllers/categories/getSingleCategory');

// Guards B4: the bookmarks include must be a LEFT JOIN so a public category with
// no public bookmarks is still returned (not 404) to guests.
test('guest bookmarks include is optional and filtered to public', async (t) => {
  loadConfig.setCache({ useOrdering: 'orderId' });
  const category = { id: 1, name: 'Empty public', bookmarks: [] };
  const findOne = t.mock.method(Category, 'findOne', async () => category);
  let body;
  const res = { status: () => ({ json: (b) => (body = b) }) };

  await getSingleCategory({ isAuthenticated: false, params: { id: '1' } }, res, assert.ifError);

  const opts = findOne.mock.calls[0].arguments[0];
  assert.strictEqual(opts.where.isPublic, true);
  assert.strictEqual(opts.include[0].as, 'bookmarks');
  assert.strictEqual(opts.include[0].required, false);
  assert.deepStrictEqual(opts.include[0].where, { isPublic: true });
  assert.deepStrictEqual(body.data, category);
  loadConfig.clearCache();
});

test('guest with a public category and no public bookmarks gets 200, not 404', async (t) => {
  loadConfig.setCache({ useOrdering: 'name' });
  t.mock.method(Category, 'findOne', async () => ({ id: 2, name: 'Empty', bookmarks: [] }));
  let status;
  let body;
  const res = { status: (s) => { status = s; return { json: (b) => (body = b) }; } };
  let nextErr;

  await getSingleCategory({ isAuthenticated: false, params: { id: '2' } }, res, (e) => (nextErr = e));

  assert.strictEqual(nextErr, undefined);
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.data.bookmarks, []);
  loadConfig.clearCache();
});

test('authenticated users get no bookmark restriction', async (t) => {
  loadConfig.setCache({ useOrdering: 'orderId' });
  const findOne = t.mock.method(Category, 'findOne', async () => ({ id: 3 }));
  const res = { status: () => ({ json: () => {} }) };

  await getSingleCategory({ isAuthenticated: true, params: { id: '3' } }, res, assert.ifError);

  const opts = findOne.mock.calls[0].arguments[0];
  assert.deepStrictEqual(opts.where, { id: '3' });
  assert.deepStrictEqual(opts.include[0].where, {});
  assert.strictEqual(opts.include[0].required, false);
  loadConfig.clearCache();
});
