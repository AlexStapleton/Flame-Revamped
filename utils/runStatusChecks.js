const App = require('../models/App');
const { checkAppStatus } = require('./checkAppStatus');

// Whether a fresh probe result warrants a DB write. Pure + testable.
// We only persist when the status actually changed: this job runs for every
// monitored app on every interval (default 60s), and `statusCheckedAt` is not
// surfaced anywhere in the UI, so re-writing an unchanged row each tick is pure
// write churn (WAL growth + SQLite writer contention) on an otherwise-idle app.
const needsUpdate = (app, status) => app.status !== status;

// Probe one app and persist its status only when it changed. Never throws.
const checkOne = async (app) => {
  try {
    const status = await checkAppStatus(app.statusCheckUrl || app.url);
    if (needsUpdate(app, status)) {
      await app.update({ status, statusCheckedAt: new Date() });
    }
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
runStatusChecks.needsUpdate = needsUpdate;
module.exports = runStatusChecks;
