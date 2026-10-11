const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const {
  buildWeatherUrl,
  parseWeather,
  parseAlerts,
  apiErrorMessage,
  MAX_ALERTS,
} = require('../utils/weatherParse');
const migration = require('../db/migrations/09_weather-details');

// Trimmed copy of a real forecast.json response (days=3, aqi=yes, alerts=yes).
const day = (date, max, min, rain, code) => ({
  date,
  day: {
    maxtemp_c: max,
    mintemp_c: min,
    maxtemp_f: max * 1.8 + 32,
    mintemp_f: min * 1.8 + 32,
    daily_chance_of_rain: rain,
    daily_chance_of_snow: 0,
    condition: { text: 'Patchy rain nearby', code },
  },
  astro: { sunrise: '07:02 AM', sunset: '06:11 PM' },
  hour: [{ time: 'not stored' }],
});

const ALERT = {
  headline: 'Wind warning',
  event: 'Wind',
  severity: 'Moderate',
  areas: 'Mazowieckie',
  effective: '2026-10-11T06:00:00+02:00',
  expires: '2026-10-11T18:00:00+02:00',
  desc: 'Gusts up to 70 km/h.',
  instruction: '',
};

const RESPONSE = {
  location: { name: 'Warsaw', region: 'Mazowieckie', country: 'Poland' },
  current: {
    last_updated: '2026-10-11 08:30',
    temp_c: 12.4,
    temp_f: 54.3,
    is_day: 1,
    condition: { text: 'Partly cloudy', code: 1003 },
    wind_mph: 8.7,
    wind_kph: 14.0,
    wind_dir: 'NW',
    pressure_mb: 1016.0,
    pressure_in: 30.0,
    precip_mm: 0.1,
    precip_in: 0.0,
    humidity: 72,
    cloud: 40,
    feelslike_c: 10.2,
    feelslike_f: 50.4,
    vis_km: 10.0,
    vis_miles: 6.0,
    uv: 3.0,
    gust_mph: 12.1,
    gust_kph: 19.5,
    air_quality: { pm2_5: 8.1, 'us-epa-index': 1, 'gb-defra-index': 1 },
  },
  forecast: {
    forecastday: [
      day('2026-10-11', 15, 6, 40, 1063),
      day('2026-10-12', 17, 8, 0, 1000),
      day('2026-10-13', 16, 9, 10, 1003),
    ],
  },
  alerts: { alert: [ALERT, { ...ALERT }] },
};

test('builds a forecast.json URL for 3 days with air quality and alerts', () => {
  const url = new URL(buildWeatherUrl('k&ey', 52.2, 21.01));
  assert.strictEqual(url.pathname, '/v1/forecast.json');
  assert.strictEqual(url.searchParams.get('key'), 'k&ey');
  assert.strictEqual(url.searchParams.get('q'), '52.2,21.01');
  assert.strictEqual(url.searchParams.get('days'), '3');
  assert.strictEqual(url.searchParams.get('aqi'), 'yes');
  assert.strictEqual(url.searchParams.get('alerts'), 'yes');
});

test('maps current conditions, keeping the original fields', () => {
  const w = parseWeather(RESPONSE);
  assert.strictEqual(w.tempC, 12.4);
  assert.strictEqual(w.tempF, 54.3);
  assert.strictEqual(w.conditionCode, 1003);
  assert.strictEqual(w.humidity, 72);
  assert.strictEqual(w.cloud, 40);
  assert.strictEqual(w.windK, 14);
  assert.strictEqual(w.feelsLikeC, 10.2);
  assert.strictEqual(w.windDir, 'NW');
  assert.strictEqual(w.uv, 3);
  assert.strictEqual(w.aqi, 1);
  assert.strictEqual(w.locationName, 'Warsaw');
});

test('maps 3 forecast days without the hourly data', () => {
  const { forecast } = parseWeather(RESPONSE);
  assert.strictEqual(forecast.length, 3);
  assert.deepStrictEqual(Object.keys(forecast[0]).includes('hour'), false);
  assert.strictEqual(forecast[0].date, '2026-10-11');
  assert.strictEqual(forecast[0].maxC, 15);
  assert.strictEqual(forecast[0].rainChance, 40);
  assert.strictEqual(forecast[0].sunrise, '07:02 AM');
  assert.strictEqual(forecast[1].conditionCode, 1000);
});

test('drops duplicate alerts and caps the list', () => {
  assert.strictEqual(parseWeather(RESPONSE).alerts.length, 1);
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...ALERT,
    headline: `Alert ${i}`,
  }));
  assert.strictEqual(parseAlerts({ alerts: { alert: many } }).length, MAX_ALERTS);
  assert.deepStrictEqual(parseAlerts({ alerts: { alert: [{}] } }), []);
});

test('tolerates fields switched off on the WeatherAPI fields page', () => {
  const w = parseWeather({ current: { temp_c: 5, condition: {} } });
  assert.strictEqual(w.tempC, 5);
  assert.strictEqual(w.feelsLikeC, null);
  assert.strictEqual(w.aqi, null);
  assert.strictEqual(w.conditionCode, null);
  assert.deepStrictEqual(w.forecast, []);
  assert.deepStrictEqual(w.alerts, []);
});

test('rejects a response with no current conditions', () => {
  assert.throws(() => parseWeather({}), /no current conditions/);
});

test("uses WeatherAPI's own error message when there is one", () => {
  assert.strictEqual(
    apiErrorMessage(401, { error: { code: 2006, message: 'API key is invalid.' } }),
    'Weather API: API key is invalid.'
  );
  assert.strictEqual(
    apiErrorMessage(503, null),
    'Weather API responded with HTTP 503'
  );
});

test('09_weather-details adds and removes the new columns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-mig-'));
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(dir, 'db.sqlite'),
    logging: false,
  });
  try {
    const qi = sequelize.getQueryInterface();
    await sequelize.query(
      'CREATE TABLE weather (id INTEGER PRIMARY KEY, tempC FLOAT)'
    );
    await sequelize.query('INSERT INTO weather (tempC) VALUES (12)');
    await migration.up(qi);

    const cols = await qi.describeTable('weather');
    for (const name of Object.keys(migration.COLUMNS)) {
      assert.ok(name in cols, `missing ${name}`);
    }
    const [rows] = await sequelize.query('SELECT forecast FROM weather');
    assert.strictEqual(rows[0].forecast, null);

    await migration.down(qi);
    assert.ok(!('forecast' in (await qi.describeTable('weather'))));
  } finally {
    await sequelize.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
