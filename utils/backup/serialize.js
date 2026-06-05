const path = require('path');
const File = require('../File');
const App = require('../../models/App');
const Category = require('../../models/Category');
const Bookmark = require('../../models/Bookmark');
const loadConfig = require('../loadConfig');
const { stripSecrets } = require('./secrets');
const { SCHEMA_VERSION } = require('./validate');
const { version: appVersion } = require('../../package.json');

const CSS_PATH = path.join(__dirname, '../../public/flame.css');

// Read a `{ [key]: [...] }` JSON file and return the named array, or [] if the
// file is missing/unparseable. `File.read()` returns an error STRING (not a
// throw) on failure, so JSON.parse is wrapped.
const readJsonArray = (filePath, key) => {
  try {
    const raw = new File(filePath).read();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
};

const readCss = () => {
  try {
    const raw = new File(CSS_PATH).read();
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
};

// Build the full backup envelope from every data source. Secrets are stripped
// from config. Returns a plain object ready to JSON.stringify.
const buildBackup = async () => {
  const [apps, categories, bookmarks, config] = await Promise.all([
    App.findAll({ raw: true }),
    Category.findAll({ raw: true }),
    Bookmark.findAll({ raw: true }),
    loadConfig(),
  ]);

  return {
    flameBackup: true,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: {
      apps,
      categories,
      bookmarks,
      config: stripSecrets(config),
      themes: readJsonArray('data/themes.json', 'themes'),
      queries: readJsonArray('data/customQueries.json', 'queries'),
      customCss: readCss(),
    },
  };
};

module.exports = { buildBackup, readJsonArray };
