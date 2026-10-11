const getExternalWeather = require('./getExternalWeather');
const Sockets = require('../Sockets');

// Fetch current weather and push it to every open dashboard. Callers decide
// whether a weather key is configured; this only fetches and broadcasts.
module.exports = async function refreshWeather() {
  const weatherData = await getExternalWeather();
  // The socket is registered after jobs start, so a startup refresh may run
  // before it exists. Nobody can be connected then, so skipping is fine.
  const entry = Sockets.getSocket('weather');
  if (entry) entry.socket.send(JSON.stringify(weatherData));
  return weatherData;
};
