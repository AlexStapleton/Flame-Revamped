const fs = require('fs');
const path = require('path');
const { sequelize } = require('../../db');
const App = require('../../models/App');
const Category = require('../../models/Category');
const Bookmark = require('../../models/Bookmark');
const File = require('../File');
const ErrorResponse = require('../ErrorResponse');
const loadConfig = require('../loadConfig');
const { SECRET_KEYS } = require('./secrets');
const { buildBackup } = require('./serialize');

const CSS_PATH = path.join(__dirname, '../../public/flame.css');
const BACKUP_DIR = 'data/backups';

// Snapshot current state to data/backups/pre-import-<timestamp>.json so a bad
// import is recoverable. Returns the file path written.
const writeSafetyBackup = async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshot = await buildBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(BACKUP_DIR, `pre-import-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot));
  return filePath;
};

// Merge imported config over current config.json, preserving live secrets (the
// export omits them, so a naive merge would blank them out). Refresh the cache.
const restoreConfig = async (importedConfig = {}) => {
  const current = await loadConfig();
  const merged = { ...current, ...importedConfig };
  for (const key of SECRET_KEYS) merged[key] = current[key];
  new File('data/config.json').write(merged, true);
  loadConfig.setCache(merged);
};

// Replace all DB rows + file-backed sources from a validated envelope.
const applyBackup = async (envelope) => {
  const data = envelope.data || {};

  const safetyBackupPath = await writeSafetyBackup();

  // DB: wipe + recreate inside a transaction. Order matters for the FK:
  // bookmarks reference categories.
  // Note: background jobs (runStatusChecks, syncApps) may write App rows during
  // the wipe/recreate window. SQLite serializes the writes (busy_timeout), so the
  // worst case is a benign lost status update that the next job tick reconciles.
  // Two concurrent imports are not guarded against; the later one wins.
  await sequelize.transaction(async (t) => {
    await Bookmark.destroy({ where: {}, transaction: t });
    await Category.destroy({ where: {}, transaction: t });
    await App.destroy({ where: {}, transaction: t });

    if (data.categories?.length) {
      await Category.bulkCreate(data.categories, { transaction: t });
    }
    if (data.bookmarks?.length) {
      await Bookmark.bulkCreate(data.bookmarks, { transaction: t });
    }
    if (data.apps?.length) {
      await App.bulkCreate(data.apps, { transaction: t });
    }
  });

  // Files: only after a successful DB commit. These are NOT transactional, so a
  // failure here can leave the DB restored but files partially written. We catch
  // and rethrow with the safety-snapshot path so the operator can recover by
  // hand from data/backups/. (Recovery is manual — re-import the snapshot file.)
  try {
    new File('data/themes.json').write({ themes: data.themes || [] }, true);
    new File('data/customQueries.json').write({ queries: data.queries || [] }, true);
    new File(CSS_PATH).write(
      typeof data.customCss === 'string' ? data.customCss : '',
      false
    );
    await restoreConfig(data.config);
  } catch (err) {
    throw new ErrorResponse(
      `Import partially applied: database was restored but writing settings files failed (${err.message}). ` +
        `Your previous data was snapshotted to ${safetyBackupPath} — re-import that file to recover.`,
      500
    );
  }

  return { safetyBackupPath };
};

module.exports = { applyBackup, writeSafetyBackup, restoreConfig };
