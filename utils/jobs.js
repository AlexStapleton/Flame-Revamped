const schedule = require('node-schedule');
const getExternalWeather = require('./getExternalWeather');
const clearWeatherData = require('./clearWeatherData');
const syncApps = require('./syncApps');
const runStatusChecks = require('./runStatusChecks');
const { isActive } = require('./activity');
const Sockets = require('../Sockets');
const Logger = require('./Logger');
const loadConfig = require('./loadConfig');
const logger = new Logger();

module.exports = async function () {
  const { WEATHER_API_KEY, statusCheckInterval } = await loadConfig();

  if (WEATHER_API_KEY != '') {
    // Update weather data every 15 minutes
    const weatherJob = schedule.scheduleJob(
      'updateWeather',
      '0 */15 * * * *',
      async () => {
        try {
          const weatherData = await getExternalWeather();

          Sockets.getSocket('weather').socket.send(JSON.stringify(weatherData));
        } catch (err) {
          if (WEATHER_API_KEY) {
            logger.log(err.message, 'ERROR');
          }
        }
      }
    );

    // Clear old weather data every 4 hours
    const weatherCleanerJob = schedule.scheduleJob(
      'clearWeather',
      '0 5 */4 * * *',
      async () => {
        clearWeatherData();
      }
    );
  }

  // Sync Docker/Kubernetes apps once a minute. This previously ran inline on
  // every public GET /api/apps; moving it here keeps reads cheap. The sync reads
  // the dockerApps/kubernetesApps flags each run, so toggling them in settings
  // takes effect without a restart.
  schedule.scheduleJob('syncApps', '0 * * * * *', async () => {
    try {
      await syncApps();
    } catch (err) {
      logger.log(`App sync failed: ${err.message}`, 'ERROR');
    }
  });

  // Run one sync at startup so discovered apps appear promptly instead of after
  // the first scheduled tick.
  syncApps().catch((err) =>
    logger.log(`Initial app sync failed: ${err.message}`, 'ERROR')
  );

  // App health checks every statusCheckInterval seconds (config, default 60).
  // A self-rescheduling timer keeps the cadence config-driven (vs a fixed cron).
  const intervalMs = Math.max(15, Number(statusCheckInterval) || 60) * 1000;
  // Pause probing when nobody is looking. The status dots are only consumed by an
  // open dashboard (which loads/polls GET /api/apps), so an unattended instance
  // shouldn't keep hitting every monitored host. A view resumes it on the next
  // tick. The window is generous relative to the poll cadence so a normally-open
  // tab never trips it.
  const idleWindowMs = Math.max(intervalMs * 2, 5 * 60 * 1000);
  const statusTick = async () => {
    if (!isActive(idleWindowMs)) return;
    try {
      await runStatusChecks();
    } catch (err) {
      logger.log(`Status checks failed: ${err.message}`, 'ERROR');
    }
  };
  setInterval(statusTick, intervalMs);
  statusTick(); // run once at startup
};
