const Weather = require('../models/Weather');
const loadConfig = require('./loadConfig');
const { buildWeatherUrl, parseWeather, apiErrorMessage } = require('./weatherParse');

// Errors whose message is safe to show in Settings (WeatherAPI's own reason,
// such as an invalid key). Anything else becomes a generic message.
class WeatherApiError extends Error {}

const fetchWeather = async () => {
  const { WEATHER_API_KEY: secret, lat, long } = await loadConfig();

  try {
    const res = await fetch(buildWeatherUrl(secret, lat, long), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new WeatherApiError(apiErrorMessage(res.status, body));
    }
    const fields = parseWeather(await res.json());

    // Keep a single row updated in place rather than inserting a new row every
    // 15 minutes (the cleaner job prunes any older legacy rows).
    const existing = await Weather.findOne({ order: [['id', 'DESC']] });
    return existing
      ? await existing.update(fields)
      : await Weather.create(fields);
  } catch (err) {
    if (err instanceof WeatherApiError) throw err;
    throw new WeatherApiError('External API request failed');
  }
};

// Calls that arrive while a fetch is already running share its result instead
// of spending another API call (e.g. a settings save during a scheduled run).
let inFlight = null;
const getExternalWeather = () => {
  if (!inFlight) {
    inFlight = fetchWeather().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

getExternalWeather.WeatherApiError = WeatherApiError;
module.exports = getExternalWeather;
