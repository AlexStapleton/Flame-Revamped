const getExternalWeather = require('./getExternalWeather');
const Sockets = require('../Sockets');

// Fetch current weather and push it to the dashboard widget. Callers decide
// whether a weather key is configured; this only fetches and broadcasts.
module.exports = async function refreshWeather() {
  const weatherData = await getExternalWeather();
  Sockets.getSocket('weather').socket.send(JSON.stringify(weatherData));
};
