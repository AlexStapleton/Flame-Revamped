const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Sequelize, DataTypes } = require('sequelize');
const Bookmark = require('../models/Bookmark');
const getAllBookmarks = require('../controllers/bookmarks/getAllBookmarks');
const getSingleBookmark = require('../controllers/bookmarks/getSingleBookmark');
const { bookmarkVisibility } = require('../utils/bookmarkVisibility');
const { buildBookmarkQuery } = getAllBookmarks;

// Real SQLite (in-memory) with local copies of the models, so the generated SQL
// (join + ordering, incl. the name column that exists on both tables) is exercised.
let db, B, C;

before(async () => {
  db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  C = db.define(
    'Category',
    {
      name: DataTypes.STRING,
      isPublic: { type: DataTypes.INTEGER, defaultValue: 1 },
    },
    { tableName: 'categories' }
  );
  B = db.define(
    'Bookmark',
    {
      name: DataTypes.STRING,
      categoryId: DataTypes.INTEGER,
      isPublic: { type: DataTypes.INTEGER, defaultValue: 1 },
      orderId: DataTypes.INTEGER,
    },
    { tableName: 'bookmarks' }
  );
  B.belongsTo(C, { foreignKey: 'categoryId' });
  await db.sync();
  const pub = await C.create({ name: 'Zeta public', isPublic: 1 });
  const priv = await C.create({ name: 'Alpha private', isPublic: 0 });
  await B.bulkCreate([
    { name: 'b-in-public', categoryId: pub.id, isPublic: 1, orderId: 2 },
    { name: 'A-in-public', categoryId: pub.id, isPublic: 1, orderId: 1 },
    { name: 'hidden-in-public', categoryId: pub.id, isPublic: 0, orderId: 3 },
    { name: 'leaky-in-private', categoryId: priv.id, isPublic: 1, orderId: 4 },
  ]);
});

after(() => db.close());

const names = (rows) => rows.map((r) => r.name);

test('guest sees only public bookmarks in public categories, name-ordered', async () => {
  const rows = await B.findAll(buildBookmarkQuery(false, 'name', C));
  assert.deepStrictEqual(names(rows), ['A-in-public', 'b-in-public']);
});

test('guest ordering by orderId works with the join', async () => {
  const rows = await B.findAll(buildBookmarkQuery(false, 'orderId', C));
  assert.deepStrictEqual(names(rows), ['A-in-public', 'b-in-public']);
});

test('authenticated sees everything', async () => {
  const rows = await B.findAll(buildBookmarkQuery(true, 'orderId', C));
  assert.strictEqual(rows.length, 4);
  assert.ok(names(rows).includes('leaky-in-private'));
});

test('single bookmark: guest blocked for private category, allowed for public', async () => {
  const leaky = await B.findOne({ where: { name: 'leaky-in-private' } });
  const ok = await B.findOne({ where: { name: 'b-in-public' } });
  const find = (id, isAuth) => {
    const { where, include } = bookmarkVisibility(isAuth, C);
    return B.findOne({ where: { id, ...where }, include });
  };
  assert.strictEqual(await find(leaky.id, false), null);
  assert.ok(await find(ok.id, false));
  assert.ok(await find(leaky.id, true));
});

test('controllers pass the category filter for guests only', async (t) => {
  const loadConfig = require('../utils/loadConfig');
  loadConfig.setCache({ useOrdering: 'name' });
  const all = t.mock.method(Bookmark, 'findAll', async () => []);
  const one = t.mock.method(Bookmark, 'findOne', async () => null);
  const res = { status: () => ({ json: () => {} }) };

  await getAllBookmarks({ isAuthenticated: false }, res, assert.ifError);
  const opts = all.mock.calls[0].arguments[0];
  assert.strictEqual(opts.where.isPublic, true);
  assert.strictEqual(opts.include[0].required, true);
  assert.strictEqual(opts.include[0].where.isPublic, true);

  await getSingleBookmark({ isAuthenticated: false, params: { id: '1' } }, res, () => {});
  const sopts = one.mock.calls[0].arguments[0];
  assert.strictEqual(sopts.include[0].where.isPublic, true);

  await getAllBookmarks({ isAuthenticated: true }, res, assert.ifError);
  assert.deepStrictEqual(all.mock.calls[1].arguments[0].include, []);
  loadConfig.clearCache();
});
