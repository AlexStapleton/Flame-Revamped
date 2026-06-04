const { Sequelize } = require('sequelize');
const { join } = require('path');
const fs = require('fs');
const { Umzug, SequelizeStorage } = require('umzug');

// Utils
const backupDB = require('./utils/backupDb');
const Logger = require('../utils/Logger');
const logger = new Logger();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/db.sqlite',
  logging: false,
});

const umzug = new Umzug({
  migrations: {
    glob: ['migrations/*.js', { cwd: __dirname }],
    resolve: ({ name, path, context }) => {
      const migration = require(path);
      return {
        name,
        up: async () => migration.up(context),
        down: async () => migration.down(context),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

const connectDB = async () => {
  try {
    backupDB();
    await sequelize.authenticate();

    // FKs for connection
    await sequelize.query('PRAGMA foreign_keys = ON;');

    // Concurrency/throughput: WAL lets readers (public page loads) run alongside
    // a writer (scheduled jobs, reorders, edits) instead of serializing; the busy
    // timeout avoids spurious SQLITE_BUSY "database is locked" errors; NORMAL
    // synchronous is the recommended, safe pairing with WAL.
    await sequelize.query('PRAGMA journal_mode = WAL;');
    await sequelize.query('PRAGMA busy_timeout = 5000;');
    await sequelize.query('PRAGMA synchronous = NORMAL;');
    logger.log(
      'SQLite PRAGMAs set: foreign_keys=ON, journal_mode=WAL, busy_timeout=5000, synchronous=NORMAL'
    );

    // debug => console => what 2 do ??
    const executed = await umzug.executed();
    logger.log(
      `Executed migrations: ${
        executed.length ? executed.map((m) => m.name).join(', ') : '(none)'
      }`
    );

    const pending = await umzug.pending();
    logger.log(
      `Pending migrations: ${
        pending.length ? pending.map((m) => m.name).join(', ') : '(none)'
      }`
    );

    if (pending.length > 0) {
      logger.log('Executing pending migrations');
      await umzug.up();
      logger.log('Migrations completed');
    }

    logger.log('Connected to database');
  } catch (error) {
    logger.log(`Unable to connect to the database: ${error.message}`, 'ERROR');
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  sequelize,
};
