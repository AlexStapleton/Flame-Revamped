const { sequelize } = require('../db');
const App = require('../models/App');

// Apply a plan from computeSyncPlan atomically, so a concurrent homescreen read
// never sees a half-applied sync (e.g. apps briefly unpinned). A no-op plan
// issues no writes at all.
const applySyncPlan = async ({ creates, updates, unpins }) => {
  if (!creates.length && !updates.length && !unpins.length) return;

  await sequelize.transaction(async (transaction) => {
    for (const fields of creates) {
      await App.create(fields, { transaction });
    }
    for (const { id, fields } of updates) {
      await App.update(fields, { where: { id }, transaction });
    }
    if (unpins.length) {
      await App.update(
        { isPinned: false },
        { where: { id: unpins }, transaction }
      );
    }
  });
};

module.exports = applySyncPlan;
