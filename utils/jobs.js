const schedule = require('node-schedule');
const refreshWeather = require('./refreshWeather');
const clearWeatherData = require('./clearWeatherData');
const syncApps = require('./syncApps');
const createSyncTick = require('./syncTick');
const runStatusChecks = require('./runStatusChecks');
const { createStatusTick } = require('./statusTick');
const { isActive } = require('./activity');
const Logger = require('./Logger');
const loadConfig = require('./loadConfig');
const logger = new Logger();

module.exports = async function () {
  const { statusCheckInterval } = await loadConfig();

  // Weather jobs are always scheduled. The key is read on every run, so a key
  // added in Settings takes effect without a restart.
  // Update weather data every 15 minutes.
  schedule.scheduleJob('updateWeather', '0 */15 * * * *', async () => {
    try {
      const { WEATHER_API_KEY } = await loadConfig();
      if (!WEATHER_API_KEY) return;

      await refreshWeather();
    } catch (err) {
      logger.log(err.message, 'ERROR');
    }
  });

  // Clear old weather data every 4 hours
  schedule.scheduleJob('clearWeather', '0 5 */4 * * *', async () => {
    clearWeatherData();
  });

  // Sync Docker/Kubernetes apps once a minute, but only while a dashboard is
  // being viewed (same idle window as status checks) and never overlapping a
  // run that is still in flight. The sync reads the dockerApps/kubernetesApps
  // flags each run, so toggling them in settings takes effect without a restart.
  // The startup sync below and POST /api/apps/sync always run.
  const intervalMs = Math.max(15, Number(statusCheckInterval) || 60) * 1000;
  const idleWindowMs = Math.max(intervalMs * 2, 5 * 60 * 1000);
  const syncTick = createSyncTick({
    isActive,
    syncApps,
    idleWindowMs,
    onError: (err) => logger.log(`App sync failed: ${err.message}`, 'ERROR'),
  });
  schedule.scheduleJob('syncApps', '0 * * * * *', syncTick);

  // Run one sync at startup so discovered apps appear promptly instead of after
  // the first scheduled tick.
  syncApps().catch((err) =>
    logger.log(`Initial app sync failed: ${err.message}`, 'ERROR')
  );

  // App health checks every statusCheckInterval seconds (config, default 60).
  // A self-rescheduling timer keeps the cadence config-driven (vs a fixed cron).
  // Pause probing when nobody is looking. The status dots are only consumed by an
  // open dashboard (which loads/polls GET /api/apps), so an unattended instance
  // shouldn't keep hitting every monitored host. A view resumes it on the next
  // tick. The window is generous relative to the poll cadence so a normally-open
  // tab never trips it.
  // (idleWindowMs is defined above, before the sync schedule.)
  const statusTick = createStatusTick({
    isActive,
    run: runStatusChecks,
    idleWindowMs,
    onError: (err) => logger.log(`Status checks failed: ${err.message}`, 'ERROR'),
  });
  setInterval(statusTick, intervalMs);
  statusTick(); // run once at startup
};
