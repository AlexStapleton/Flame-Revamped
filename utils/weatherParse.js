// Pure helpers for WeatherAPI responses, kept free of the DB so they can be
// unit tested.
//
// One forecast.json call (days=3, aqi=yes, alerts=yes) returns current
// conditions, today's high/low, sunrise/sunset, a 3-day forecast, air quality
// and alerts. 3 days is the free plan's maximum. It replaces the old
// current.json call one for one, so the call count is unchanged: one every 15
// minutes is about 3,000 a month against the free plan's 100,000.

const FORECAST_DAYS = 3;
const MAX_ALERTS = 5;
const MAX_ALERT_TEXT = 2000;

const buildWeatherUrl = (key, lat, long) =>
  'https://api.weatherapi.com/v1/forecast.json' +
  `?key=${encodeURIComponent(key)}&q=${encodeURIComponent(`${lat},${long}`)}` +
  `&days=${FORECAST_DAYS}&aqi=yes&alerts=yes`;

// A field switched off on the account's WeatherAPI "fields" page is left out
// of the response, so every read tolerates a missing value.
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 200) =>
  typeof v === 'string' && v.length ? v.slice(0, max) : null;

const parseForecast = (data) => {
  const days = data?.forecast?.forecastday;
  if (!Array.isArray(days)) return [];
  return days.slice(0, FORECAST_DAYS).map((d) => ({
    date: str(d?.date, 10),
    maxC: num(d?.day?.maxtemp_c),
    minC: num(d?.day?.mintemp_c),
    maxF: num(d?.day?.maxtemp_f),
    minF: num(d?.day?.mintemp_f),
    rainChance: num(d?.day?.daily_chance_of_rain),
    snowChance: num(d?.day?.daily_chance_of_snow),
    conditionText: str(d?.day?.condition?.text),
    conditionCode: num(d?.day?.condition?.code),
    sunrise: str(d?.astro?.sunrise, 20),
    sunset: str(d?.astro?.sunset, 20),
  }));
};

// WeatherAPI often repeats the same alert (for example once per language or
// per area), so duplicates are dropped and the list is capped.
const parseAlerts = (data) => {
  const list = data?.alerts?.alert;
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const alerts = [];
  for (const a of list) {
    const alert = {
      headline: str(a?.headline, 300),
      event: str(a?.event, 200),
      severity: str(a?.severity, 50),
      areas: str(a?.areas, 500),
      effective: str(a?.effective, 40),
      expires: str(a?.expires, 40),
      desc: str(a?.desc, MAX_ALERT_TEXT),
      instruction: str(a?.instruction, MAX_ALERT_TEXT),
    };
    if (!alert.headline && !alert.event) continue;
    const id = `${alert.event}|${alert.headline}|${alert.expires}`;
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push(alert);
    if (alerts.length >= MAX_ALERTS) break;
  }
  return alerts;
};

const parseWeather = (data) => {
  const c = data?.current;
  if (!c) throw new Error('Weather API response has no current conditions');
  const aq = c.air_quality || {};
  return {
    externalLastUpdate: str(c.last_updated, 40),
    tempC: num(c.temp_c),
    tempF: num(c.temp_f),
    feelsLikeC: num(c.feelslike_c),
    feelsLikeF: num(c.feelslike_f),
    isDay: num(c.is_day),
    cloud: num(c.cloud),
    conditionText: str(c.condition?.text),
    conditionCode: num(c.condition?.code),
    humidity: num(c.humidity),
    windK: num(c.wind_kph),
    windM: num(c.wind_mph),
    windDir: str(c.wind_dir, 5),
    gustK: num(c.gust_kph),
    gustM: num(c.gust_mph),
    uv: num(c.uv),
    precipMm: num(c.precip_mm),
    precipIn: num(c.precip_in),
    pressureMb: num(c.pressure_mb),
    pressureIn: num(c.pressure_in),
    visKm: num(c.vis_km),
    visM: num(c.vis_miles),
    aqi: num(aq['us-epa-index']),
    locationName: str(data?.location?.name),
    forecast: parseForecast(data),
    alerts: parseAlerts(data),
  };
};

// WeatherAPI explains failures as { error: { code, message } }, for example
// "API key is invalid." Turn that into a message that is safe to show (it never
// includes the key or the request URL).
const apiErrorMessage = (status, body) => {
  const msg = str(body?.error?.message, 200);
  return msg
    ? `Weather API: ${msg}`
    : `Weather API responded with HTTP ${status}`;
};

module.exports = {
  FORECAST_DAYS,
  MAX_ALERTS,
  buildWeatherUrl,
  parseWeather,
  parseForecast,
  parseAlerts,
  apiErrorMessage,
};
