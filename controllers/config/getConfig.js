const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');

// @desc      Get config
// @route     GET /api/config
// @access    Public (weather API key masked unless authenticated)
const getConfig = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();

  // Never expose the weather API key to unauthenticated clients. The public
  // homescreen only needs to know whether weather is configured (a truthy
  // value) to render the widget, so mask the real key while keeping that
  // signal. Authenticated requests (e.g. the settings form) get the real key.
  if (!req.isAuthenticated) {
    config.WEATHER_API_KEY = config.WEATHER_API_KEY ? 'true' : '';
  }

  res.status(200).json({
    success: true,
    data: config,
  });
});

module.exports = getConfig;
