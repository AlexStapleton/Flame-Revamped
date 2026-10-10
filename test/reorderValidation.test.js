const { test } = require('node:test');
const assert = require('node:assert');
const reorderApps = require('../controllers/apps/reorderApps');
const reorderBookmarks = require('../controllers/bookmarks/reorderBookmarks');
const reorderCategories = require('../controllers/categories/reorderCategories');

// Guards P6b: a missing or non-array body must be a 400, not a 500 from
// calling .map on undefined. Validation runs before any transaction, so no DB needed.
const cases = [
  ['apps', reorderApps, 'apps'],
  ['bookmarks', reorderBookmarks, 'bookmarks'],
  ['categories', reorderCategories, 'categories'],
];

for (const [label, handler, key] of cases) {
  const run = async (body) => {
    let err;
    let sent = false;
    const res = { status: () => ({ json: () => (sent = true) }) };
    await handler({ body }, res, (e) => (err = e));
    return { err, sent };
  };

  test(`reorder ${label}: missing body returns 400`, async () => {
    const { err, sent } = await run(undefined);
    assert.ok(err, 'expected an error to be passed to next');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.message, `${key} must be an array`);
    assert.strictEqual(sent, false);
  });

  test(`reorder ${label}: non-array field returns 400`, async () => {
    const { err, sent } = await run({ [key]: { id: 1, orderId: 1 } });
    assert.ok(err, 'expected an error to be passed to next');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(sent, false);
  });
}
