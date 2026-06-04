const Weather = require('../models/Weather');
const axios = require('axios');
const loadConfig = require('./loadConfig');

const getExternalWeather = async () => {
  const { WEATHER_API_KEY: secret, lat, long } = await loadConfig();

  // Fetch data from external API
  try {
    const res = await axios.get(
      `https://api.weatherapi.com/v1/current.json?key=${secret}&q=${lat},${long}`
    );

    // Save weather data. Keep a single row updated in place rather than
    // inserting a new row every 15 minutes (the cleaner job prunes any older
    // legacy rows).
    const cursor = res.data.current;
    const fields = {
      externalLastUpdate: cursor.last_updated,
      tempC: cursor.temp_c,
      tempF: cursor.temp_f,
      isDay: cursor.is_day,
      cloud: cursor.cloud,
      conditionText: cursor.condition.text,
      conditionCode: cursor.condition.code,
      humidity: cursor.humidity,
      windK: cursor.wind_kph,
      windM: cursor.wind_mph,
    };

    const existing = await Weather.findOne({ order: [['id', 'DESC']] });
    const weatherData = existing
      ? await existing.update(fields)
      : await Weather.create(fields);

    return weatherData;
  } catch (err) {
    throw new Error('External API request failed');
  }
};

module.exports = getExternalWeather;
