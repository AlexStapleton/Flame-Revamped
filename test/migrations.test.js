const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');

// The full migration set can't run against a scratch DB: earlier migrations use
// the global models (./data/db.sqlite) and cwd-relative data/ files. The real
// full-set run is covered by connectDB; here 08 is exercised in isolation on a
// temp SQLite file with a minimal apps table.
const migration = require('../db/migrations/08_app-source');

test('08_app-source adds and removes apps.source', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-mig-'));
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dir, 'db.sqlite'),
    logging: false,
  });
  try {
    const qi = sequelize.getQueryInterface();
    await sequelize.query(
      'CREATE TABLE apps (id INTEGER PRIMARY KEY, name VARCHAR(255))'
    );
    await sequelize.query("INSERT INTO apps (name) VALUES ('legacy')");
    await migration.up(qi);

    const cols = await qi.describeTable('apps');
    assert.ok('source' in cols);
    assert.strictEqual(cols.source.allowNull, true);
    assert.ok(
      (await qi.showIndex('apps')).some((i) => i.name === 'apps_source')
    );

    // existing rows get source NULL (= manual)
    const [rows] = await sequelize.query('SELECT source FROM apps');
    assert.strictEqual(rows[0].source, null);

    await migration.down(qi);
    assert.ok(!('source' in (await qi.describeTable('apps'))));
  } finally {
    await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
