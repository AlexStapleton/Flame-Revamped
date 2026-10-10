const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');

// Never expose the weather API key or the Pi-hole password to unauthenticated
// clients. The public homescreen only needs to know whether weather / Pi-hole
// is configured (a truthy value) to render the widget, so mask the real values
// to 'true' while keeping that signal; authenticated requests (e.g. the
// settings form) get the real values. The Pi-hole URL is masked too, since it
// is usually a LAN address guests have no use for.
// Returns a shallow copy — never mutates the cached config. Pure + testable.
const maskConfigForViewer = (config, isAuthenticated) => {
  if (isAuthenticated) return config;
  return {
    ...config,
    WEATHER_API_KEY: config.WEATHER_API_KEY ? 'true' : '',
    PIHOLE_PASSWORD: config.PIHOLE_PASSWORD ? 'true' : '',
    piholeUrl: config.piholeUrl ? 'true' : '',
  };
};

// @desc      Get config
// @route     GET /api/config
// @access    Public (secrets masked unless authenticated)
const getConfig = asyncWrapper(async (req, res, next) => {
  const config = await loadConfig();

  res.status(200).json({
    success: true,
    data: maskConfigForViewer(config, req.isAuthenticated),
  });
});

getConfig.maskConfigForViewer = maskConfigForViewer;
module.exports = getConfig;
