const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');

// Never expose secrets or login-only widgets to unauthenticated clients;
// authenticated requests (e.g. the settings form) get the real values.
// Weather and Pi-hole are only shown to logged-in users, so guests get no
// weather key (the widget's "configured" signal), no location and no Pi-holes.
// For calendars, guests get id, name and color (nothing at all when
// calendarHideFromGuests is on); the iCal links are secrets.
// Returns a shallow copy — never mutates the cached config. Pure + testable.
const maskConfigForViewer = (config, isAuthenticated) => {
  if (isAuthenticated) return config;
  return {
    ...config,
    WEATHER_API_KEY: '',
    lat: 0,
    long: 0,
    piholes: [],
    PIHOLE_SECRETS: {},
    calendars:
      Array.isArray(config.calendars) && !config.calendarHideFromGuests
        ? config.calendars.map((c) => ({
            id: c && c.id,
            name: c && c.name,
            color: c && c.color,
          }))
        : [],
    CALENDAR_SECRETS: {},
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
