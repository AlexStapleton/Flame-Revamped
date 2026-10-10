const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');

// Never expose the weather API key or Pi-hole secrets to unauthenticated
// clients. The public homescreen only needs to know whether weather is
// configured (a truthy value) to render the widget, so mask the real key to
// 'true' while keeping that signal; authenticated requests (e.g. the settings
// form) get the real values. For Pi-hole, guests get only each entry's id and
// name (addresses are usually LAN hosts guests have no use for) and no secrets.
// Returns a shallow copy — never mutates the cached config. Pure + testable.
const maskConfigForViewer = (config, isAuthenticated) => {
  if (isAuthenticated) return config;
  return {
    ...config,
    WEATHER_API_KEY: config.WEATHER_API_KEY ? 'true' : '',
    piholes: Array.isArray(config.piholes)
      ? config.piholes.map((p) => ({ id: p && p.id, name: p && p.name }))
      : [],
    PIHOLE_SECRETS: {},
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
