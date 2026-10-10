const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const { createMigrator } = require('../db/migrator');

const quiet = { log: () => {} };

// Scratch DB plus a migrations dir with the given { file: body } entries.
const setup = (migrations) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-migrator-'));
  const mdir = path.join(dir, 'migrations');
  fs.mkdirSync(mdir);
  for (const [name, body] of Object.entries(migrations)) {
    fs.writeFileSync(path.join(mdir, name), body);
  }
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dir, 'db.sqlite'),
    logging: false,
  });
  const cleanup = async () => {
    await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { mdir, sequelize, cleanup };
};

const createTable = (t) =>
  `module.exports = { up: async (q) => { await q.sequelize.query('CREATE TABLE ${t} (x INT)'); } };`;

test('runs pending migrations in file-name order and records them', async () => {
  const { mdir, sequelize, cleanup } = setup({
    '01_b.js': createTable('b'),
    '00_a.js': createTable('a'),
    'README.md': 'not a migration',
  });
  try {
    const m = createMigrator({ sequelize, dir: mdir, logger: quiet });
    assert.deepStrictEqual(await m.pending(), ['00_a.js', '01_b.js']);
    assert.deepStrictEqual(await m.up(), ['00_a.js', '01_b.js']);
    assert.deepStrictEqual(await m.executed(), ['00_a.js', '01_b.js']);
    assert.deepStrictEqual(await m.pending(), []);
    // Second run is a no-op.
    assert.deepStrictEqual(await m.up(), []);
  } finally {
    await cleanup();
  }
});

test('reads a SequelizeMeta table in the format umzug wrote', async () => {
  const { mdir, sequelize, cleanup } = setup({
    '00_a.js': createTable('a'),
    '01_b.js': createTable('b'),
  });
  try {
    // Exact DDL umzug 3.8's SequelizeStorage creates on SQLite.
    await sequelize.query(
      'CREATE TABLE `SequelizeMeta` (`name` VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY)'
    );
    await sequelize.query("INSERT INTO `SequelizeMeta` VALUES ('00_a.js')");
    const m = createMigrator({ sequelize, dir: mdir, logger: quiet });
    assert.deepStrictEqual(await m.executed(), ['00_a.js']);
    assert.deepStrictEqual(await m.up(), ['01_b.js']);
    const [rows] = await sequelize.query(
      'SELECT name FROM `SequelizeMeta` ORDER BY name'
    );
    assert.deepStrictEqual(
      rows.map((r) => r.name),
      ['00_a.js', '01_b.js']
    );
  } finally {
    await cleanup();
  }
});

test('a failing migration stops the run and stays pending', async () => {
  const { mdir, sequelize, cleanup } = setup({
    '00_a.js': createTable('a'),
    '01_bad.js': "module.exports = { up: async () => { throw new Error('boom'); } };",
    '02_c.js': createTable('c'),
  });
  try {
    const m = createMigrator({ sequelize, dir: mdir, logger: quiet });
    await assert.rejects(m.up(), /boom/);
    assert.deepStrictEqual(await m.executed(), ['00_a.js']);
    assert.deepStrictEqual(await m.pending(), ['01_bad.js', '02_c.js']);
  } finally {
    await cleanup();
  }
});
