const { copyFile, readFile, writeFile } = require('fs/promises');
const checkFileExists = require('../checkFileExists');
const initialConfig = require('./initialConfig.json');

// One-time changes to existing config.json files, applied once per install
// and recorded in `appliedConfigMigrations` so an admin's later choice is
// never overwritten again. Adding a missing key (above) can't change a value
// an older release already wrote, which is what these are for. Pure.
const CONFIG_MIGRATIONS = [
  {
    // v2.0.0 wrote calendarHideFromGuests: false into every config.json, so a
    // never-touched toggle can't be told apart from one turned off on purpose.
    // Calendars now default to hidden from guests, like weather and Pi-hole.
    id: 'calendar-hidden-from-guests-by-default',
    apply: (config) => ({ ...config, calendarHideFromGuests: true }),
  },
];

const applyConfigMigrations = (config, migrations = CONFIG_MIGRATIONS) => {
  let applied = Array.isArray(config.appliedConfigMigrations)
    ? config.appliedConfigMigrations
    : [];
  let next = config;
  for (const { id, apply } of migrations) {
    if (applied.includes(id)) continue;
    next = apply(next);
    applied = [...applied, id];
  }
  return { ...next, appliedConfigMigrations: applied };
};

const initConfig = async () => {
  const configExists = await checkFileExists('data/config.json');

  if (!configExists) {
    await copyFile('utils/init/initialConfig.json', 'data/config.json');
  }

  const existingConfig = await readFile('data/config.json', 'utf-8');
  let parsedConfig = JSON.parse(existingConfig);

  // Add new config pairs if necessary
  for (let key in initialConfig) {
    if (!Object.keys(parsedConfig).includes(key)) {
      parsedConfig[key] = initialConfig[key];
    }
  }

  parsedConfig = applyConfigMigrations(parsedConfig);

  await writeFile('data/config.json', JSON.stringify(parsedConfig));
};

initConfig.applyConfigMigrations = applyConfigMigrations;
initConfig.CONFIG_MIGRATIONS = CONFIG_MIGRATIONS;
module.exports = initConfig;
