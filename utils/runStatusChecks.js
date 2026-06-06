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

// Cap how many probes run at once. Each probe can take up to HEAD 5s + GET 5s on
// a hanging host, so firing them all with Promise.all means a large monitored set
// opens hundreds of sockets simultaneously and stalls the whole tick on the
// slowest host. A small pool keeps the fan-out bounded.
const CONCURRENCY = 8;

// Run `worker` over `items` with at most `limit` in flight at any time. Resolves
// once every item has been processed. Pure (no I/O of its own) + testable.
const runPool = async (items, limit, worker) => {
  const queue = [...items];
  const runner = async () => {
    while (queue.length) {
      await worker(queue.shift());
    }
  };
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), queue.length) },
    runner
  );
  await Promise.all(runners);
};

// Probe every opt-in app, with bounded concurrency.
const runStatusChecks = async () => {
  const apps = await App.findAll({ where: { statusCheckEnabled: true } });
  await runPool(apps, CONCURRENCY, checkOne);
};

runStatusChecks.checkOne = checkOne;
runStatusChecks.needsUpdate = needsUpdate;
runStatusChecks.runPool = runPool;
runStatusChecks.CONCURRENCY = CONCURRENCY;
module.exports = runStatusChecks;
