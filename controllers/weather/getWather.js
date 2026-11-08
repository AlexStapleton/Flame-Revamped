const asyncWrapper = require('../../middleware/asyncWrapper');
const Weather = require('../../models/Weather');
const refreshWeatherIfStale = require('../../utils/refreshWeatherIfStale');
const Logger = require('../../utils/Logger');
const logger = new Logger();

// @desc      Get latest weather status
// @route     GET /api/weather
// @access    Logged-in users (guests get an empty list)
const getWeather = asyncWrapper(async (req, res, next) => {
  // Weather reveals where the dashboard is, so it is only for logged-in users.
  if (!req.isAuthenticated) {
    return res.status(200).json({ success: true, data: [] });
  }

  const weather = await Weather.findAll({
    order: [['createdAt', 'DESC']],
    limit: 1,
  });

  res.status(200).json({
    success: true,
    data: weather,
  });

  // The scheduled fetch pauses while no dashboard is open. When this load finds
  // the stored weather stale, refresh in the background; the socket pushes the
  // new data to this dashboard. Concurrent loads share one refresh.
  refreshWeatherIfStale().catch((err) =>
    logger.log(`Weather refresh on view failed: ${err.message}`, 'ERROR')
  );
});

module.exports = getWeather;
