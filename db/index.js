const { Sequelize } = require('sequelize');
const { join } = require('path');
const fs = require('fs');
const { createMigrator } = require('./migrator');

// Utils
const backupDB = require('./utils/backupDb');
const Logger = require('../utils/Logger');
const logger = new Logger();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/db.sqlite',
  logging: false,
});

const migrator = createMigrator({
  sequelize,
  dir: join(__dirname, 'migrations'),
  logger,
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
    const executed = await migrator.executed();
    logger.log(
      `Executed migrations: ${
        executed.length ? executed.join(', ') : '(none)'
      }`
    );

    const pending = await migrator.pending();
    logger.log(
      `Pending migrations: ${
        pending.length ? pending.join(', ') : '(none)'
      }`
    );

    if (pending.length > 0) {
      logger.log('Executing pending migrations');
      await migrator.up();
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
