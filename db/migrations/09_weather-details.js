const { DataTypes } = require('sequelize');
const { INTEGER, FLOAT, STRING, TEXT } = DataTypes;

// Extra fields from WeatherAPI's forecast.json: feels-like, wind direction and
// gusts, UV, rain, pressure, visibility, air quality, location name, and the
// 3-day forecast and alerts (stored as JSON text).
const COLUMNS = {
  feelsLikeC: FLOAT,
  feelsLikeF: FLOAT,
  windDir: STRING,
  gustK: FLOAT,
  gustM: FLOAT,
  uv: FLOAT,
  precipMm: FLOAT,
  precipIn: FLOAT,
  pressureMb: FLOAT,
  pressureIn: FLOAT,
  visKm: FLOAT,
  visM: FLOAT,
  aqi: INTEGER,
  locationName: STRING,
  forecast: TEXT,
  alerts: TEXT,
};

const up = async (query) => {
  for (const [name, type] of Object.entries(COLUMNS)) {
    await query.addColumn('weather', name, { type, allowNull: true });
  }
};

const down = async (query) => {
  for (const name of Object.keys(COLUMNS)) {
    await query.removeColumn('weather', name);
  }
};

module.exports = { up, down, COLUMNS };
