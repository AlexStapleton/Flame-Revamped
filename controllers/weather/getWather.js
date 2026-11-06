const asyncWrapper = require('../../middleware/asyncWrapper');
const Weather = require('../../models/Weather');

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
});

module.exports = getWeather;
