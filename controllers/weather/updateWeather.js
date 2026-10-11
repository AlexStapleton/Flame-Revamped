const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const refreshWeather = require('../../utils/refreshWeather');

// @desc      Fetch fresh weather and push it to open dashboards
// @route     GET /api/weather/update
// @access    Protected
// Settings calls this after every weather save, so a new key, location or
// unit shows on the dashboard at once. It is the only on-demand fetch: the
// config update no longer fetches too, which used to spend two API calls when
// a key was added.
const updateWeather = asyncWrapper(async (req, res, next) => {
  let weather;
  try {
    weather = await refreshWeather();
  } catch (err) {
    // 502: the upstream API failed. The message is WeatherAPI's own reason
    // (e.g. "API key is invalid.") or a generic one; never the key or URL.
    return next(new ErrorResponse(err.message, 502));
  }

  res.status(200).json({
    success: true,
    data: weather,
  });
});

module.exports = updateWeather;
