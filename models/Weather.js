const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

// forecast and alerts are arrays stored as JSON text. A row from before the
// forecast columns existed reads back as an empty list.
const jsonList = (name) => ({
  type: DataTypes.TEXT,
  get() {
    const raw = this.getDataValue(name);
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  },
  set(value) {
    this.setDataValue(name, JSON.stringify(Array.isArray(value) ? value : []));
  },
});

const Weather = sequelize.define(
  'Weather',
  {
    externalLastUpdate: DataTypes.STRING,
    tempC: DataTypes.FLOAT,
    tempF: DataTypes.FLOAT,
    feelsLikeC: DataTypes.FLOAT,
    feelsLikeF: DataTypes.FLOAT,
    isDay: DataTypes.INTEGER,
    cloud: DataTypes.INTEGER,
    conditionText: DataTypes.TEXT,
    conditionCode: DataTypes.INTEGER,
    humidity: DataTypes.INTEGER,
    windK: DataTypes.FLOAT,
    windM: DataTypes.FLOAT,
    windDir: DataTypes.STRING,
    gustK: DataTypes.FLOAT,
    gustM: DataTypes.FLOAT,
    uv: DataTypes.FLOAT,
    precipMm: DataTypes.FLOAT,
    precipIn: DataTypes.FLOAT,
    pressureMb: DataTypes.FLOAT,
    pressureIn: DataTypes.FLOAT,
    visKm: DataTypes.FLOAT,
    visM: DataTypes.FLOAT,
    aqi: DataTypes.INTEGER,
    locationName: DataTypes.STRING,
    forecast: jsonList('forecast'),
    alerts: jsonList('alerts'),
  },
  {
    tableName: 'weather',
  }
);

module.exports = Weather;
