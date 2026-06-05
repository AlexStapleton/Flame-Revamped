const App = require('../models/App');
const { checkAppStatus } = require('./checkAppStatus');

// Probe every opt-in app and persist online/offline. Never throws.
const runStatusChecks = async () => {
  const apps = await App.findAll({ where: { statusCheckEnabled: true } });
  await Promise.all(
    apps.map(async (app) => {
      try {
        const status = await checkAppStatus(app.statusCheckUrl || app.url);
        await app.update({ status, statusCheckedAt: new Date() });
      } catch (_) {
        /* per-app failure must not break the batch */
      }
    })
  );
};

module.exports = runStatusChecks;
