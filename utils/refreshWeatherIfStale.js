const Weather = require('../models/Weather');
const loadConfig = require('./loadConfig');
const refreshWeather = require('./refreshWeather');
const { getLastAttemptAt } = require('./getExternalWeather');

const WEATHER_INTERVAL_MS = 15 * 60 * 1000;

// Builds a "refresh if stale" function with injectable dependencies. Weather
// counts as fresh while the stored row is newer than one tick AND the last
// WeatherAPI attempt was within one tick. Concurrent calls share one refresh.
const createRefreshWeatherIfStale = ({
  loadConfig: getConfig = loadConfig,
  findLatest = () => Weather.findOne({ order: [['id', 'DESC']] }),
  refresh = refreshWeather,
  lastAttemptAt = getLastAttemptAt,
  now = Date.now,
} = {}) => {
  let pending = null;

  const run = async () => {
    const { WEATHER_API_KEY } = await getConfig();
    if (!WEATHER_API_KEY) return false;
    const latest = await findLatest();
    const storedAt = latest ? new Date(latest.updatedAt).getTime() : 0;
    const lastSeen = Math.max(storedAt, lastAttemptAt());
    const fresh =
      latest &&
      latest.getDataValue('forecast') &&
      now() - lastSeen < WEATHER_INTERVAL_MS;
    if (fresh) return false;
    await refresh();
    return true;
  };

  return () => {
    if (!pending) {
      pending = run().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
};

const refreshWeatherIfStale = createRefreshWeatherIfStale();
refreshWeatherIfStale.createRefreshWeatherIfStale = createRefreshWeatherIfStale;
refreshWeatherIfStale.WEATHER_INTERVAL_MS = WEATHER_INTERVAL_MS;
module.exports = refreshWeatherIfStale;
