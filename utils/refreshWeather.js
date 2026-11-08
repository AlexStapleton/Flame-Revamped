const { getExternalWeatherResult } = require('./getExternalWeather');
const Sockets = require('../Sockets');

// Fetch current weather and push it to every open dashboard, but only when it
// changed (an unchanged WeatherAPI reading is not broadcast). Callers decide
// whether a weather key is configured; this only fetches and broadcasts.
// Always resolves to the stored row, changed or not.
module.exports = async function refreshWeather() {
  const { row, changed } = await getExternalWeatherResult();
  // The socket is registered after jobs start, so a startup refresh may run
  // before it exists. Nobody can be connected then, so skipping is fine.
  const entry = Sockets.getSocket('weather');
  if (changed && entry) entry.socket.send(JSON.stringify(row));
  return row;
};
