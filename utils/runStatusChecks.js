const App = require('../models/App');
const { checkAppStatus } = require('./checkAppStatus');

// Probe one app and persist its status. Never throws.
const checkOne = async (app) => {
  try {
    const status = await checkAppStatus(app.statusCheckUrl || app.url);
    await app.update({ status, statusCheckedAt: new Date() });
  } catch (_) {
    /* a single failed check must not break anything */
  }
};

// Probe every opt-in app.
const runStatusChecks = async () => {
  const apps = await App.findAll({ where: { statusCheckEnabled: true } });
  await Promise.all(apps.map((app) => checkOne(app)));
};

runStatusChecks.checkOne = checkOne;
module.exports = runStatusChecks;
