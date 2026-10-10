const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');

// Minimal migration runner. Replaces umzug, whose CLI dependencies pulled
// deprecated lodash.get/lodash.isequal and the sprintf-js advisory into the
// production image. It keeps umzug's on-disk format so existing databases need
// no change: executed migrations are rows in the `SequelizeMeta` table, one
// `name` column holding the file name (e.g. `00_initial.js`).
const createMigrator = ({ sequelize, dir, logger = console }) => {
  const Meta = sequelize.define(
    'SequelizeMeta',
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true,
        autoIncrement: false,
      },
    },
    { timestamps: false, tableName: 'SequelizeMeta' }
  );

  // Every .js file in dir, in file-name order (the numeric prefix sets order).
  const all = () =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .sort();

  const executed = async () => {
    await Meta.sync();
    const rows = await Meta.findAll({ order: [['name', 'ASC']] });
    return rows.map((r) => r.name);
  };

  const pending = async () => {
    const done = new Set(await executed());
    return all().filter((name) => !done.has(name));
  };

  // Runs pending migrations one by one, recording each as soon as it succeeds,
  // so a failure stops the run and leaves later migrations pending.
  const up = async () => {
    const context = sequelize.getQueryInterface();
    const ran = [];
    for (const name of await pending()) {
      logger.log(`Migrating ${name}`);
      const started = Date.now();
      await require(path.join(dir, name)).up(context);
      await Meta.create({ name });
      logger.log(`Migrated ${name} (${(Date.now() - started) / 1000}s)`);
      ran.push(name);
    }
    return ran;
  };

  return { executed, pending, up };
};

module.exports = { createMigrator };
