const Weather = require('../models/Weather');
const loadConfig = require('./loadConfig');
const { buildWeatherUrl, parseWeather, apiErrorMessage } = require('./weatherParse');

// Errors whose message is safe to show in Settings (WeatherAPI's own reason,
// such as an invalid key). Anything else becomes a generic message.
class WeatherApiError extends Error {}

// Keep a single row updated in place rather than inserting a new row every
// 15 minutes (the cleaner job prunes any older legacy rows). WeatherAPI only
// changes last_updated about every 15 minutes, so when the stored row already
// has the same last_updated (and its forecast), nothing is written and
// changed is false.
const storeWeather = async (fields, { Model = Weather } = {}) => {
  const existing = await Model.findOne({ order: [['id', 'DESC']] });
  if (
    existing &&
    existing.getDataValue('forecast') &&
    existing.externalLastUpdate === fields.externalLastUpdate
  ) {
    return { row: existing, changed: false };
  }
  const row = existing ? await existing.update(fields) : await Model.create(fields);
  return { row, changed: true };
};

// When the last WeatherAPI request was started (success or failure). Used by
// the "refresh if stale" check so page loads cannot hammer a failing API.
let lastAttemptAt = 0;
const getLastAttemptAt = () => lastAttemptAt;

const fetchWeather = async () => {
  const { WEATHER_API_KEY: secret, lat, long } = await loadConfig();
  lastAttemptAt = Date.now();

  try {
    const res = await fetch(buildWeatherUrl(secret, lat, long), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new WeatherApiError(apiErrorMessage(res.status, body));
    }
    const fields = parseWeather(await res.json());
    return await storeWeather(fields);
  } catch (err) {
    if (err instanceof WeatherApiError) throw err;
    throw new WeatherApiError('External API request failed');
  }
};

// Calls that arrive while a fetch is already running share its result instead
// of spending another API call (e.g. a settings save during a scheduled run).
// Resolves to { row, changed }.
let inFlight = null;
const getExternalWeatherResult = () => {
  if (!inFlight) {
    inFlight = fetchWeather().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

const getExternalWeather = async () => (await getExternalWeatherResult()).row;

getExternalWeather.WeatherApiError = WeatherApiError;
getExternalWeather.getExternalWeatherResult = getExternalWeatherResult;
getExternalWeather.getLastAttemptAt = getLastAttemptAt;
getExternalWeather.storeWeather = storeWeather;
module.exports = getExternalWeather;
