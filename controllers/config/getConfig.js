const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');

// Never expose the weather API key to unauthenticated clients. The public
// homescreen only needs to know whether weather is configured (a truthy value)
// to render the widget, so mask the real key to 'true' while keeping that
// signal; authenticated requests (e.g. the settings form) get the real key.
// Returns a shallow copy — never mutates the cached config. Pure + testable.
const maskConfigForViewer = (config, isAuthenticated) => {
  if (isAuthenticated) return config;
  return {
    ...config,
    WEATHER_API_KEY: config.WEATHER_API_KEY ? 'true' : '',
  };
};

// @desc      Get config
// @route     GET /api/config
// @access    Public (weather API key masked unless authenticated)
const getConfig = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();

  res.status(200).json({
    success: true,
    data: maskConfigForViewer(config, req.isAuthenticated),
  });
});

getConfig.maskConfigForViewer = maskConfigForViewer;
module.exports = getConfig;
