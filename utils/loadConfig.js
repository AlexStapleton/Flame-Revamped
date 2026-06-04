const fs = require('fs');
const { readFile } = require('fs/promises');
const checkFileExists = require('../utils/checkFileExists');
const initConfig = require('../utils/init/initConfig');

// Runtime source of truth for configuration is `data/config.json`. The `config`
// SQLite table is legacy — it is only read once by the 01_new-config migration to
// seed config.json and is never read or written at runtime. Keep all runtime
// config flowing through this module so there is a single, cached source.
//
// config.json is tiny and read by nearly every request, so we cache the parsed
// object in memory instead of re-reading + re-parsing from disk each time. The
// cache is refreshed when the app writes config (see updateConfig) and dropped
// when the file changes on disk (e.g. an external/volume edit).

const CONFIG_PATH = 'data/config.json';

let cache = null;
let watcherStarted = false;

// Watch the file so external edits invalidate the cache. Best-effort: file
// watching can be unreliable on some bind mounts, so failures are non-fatal —
// the worst case is that an external edit isn't picked up until restart.
const startWatcher = () => {
  if (watcherStarted) return;
  watcherStarted = true;
  try {
    fs.watch(CONFIG_PATH, () => {
      cache = null;
    });
  } catch {
    watcherStarted = false;
  }
};

const loadConfig = async () => {
  if (cache) {
    // Hand out a shallow copy so callers (e.g. getConfig, which masks the
    // weather key) can't mutate the cached object.
    return { ...cache };
  }

  const configExists = await checkFileExists(CONFIG_PATH);

  if (!configExists) {
    await initConfig();
  }

  const config = await readFile(CONFIG_PATH, 'utf-8');
  cache = JSON.parse(config);

  startWatcher();

  return { ...cache };
};

// Refresh the cache from a known-good object after the app writes config, so the
// next read doesn't need to hit disk.
loadConfig.setCache = (config) => {
  cache = { ...config };
};

// Drop the cache so the next read re-parses from disk.
loadConfig.clearCache = () => {
  cache = null;
};

module.exports = loadConfig;
