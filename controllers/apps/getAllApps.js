const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');
const { markActive } = require('../../utils/activity');
const { redactAppForGuest } = require('../../utils/redactApp');
const { iconPathsFor } = require('../../utils/iconPaths');

// @desc      Get all apps
// @route     GET /api/apps
// @access    Public
const getAllApps = asyncWrapper(async (req, res, next) => {
  // Signal that a dashboard is being viewed so the status-check job keeps probing
  // (it pauses on an unattended instance).
  markActive();

  const { useOrdering: orderType } = await loadConfig();

  // apps visibility
  const where = req.isAuthenticated ? {} : { isPublic: true };

  const order =
    orderType == 'name'
      ? [[Sequelize.fn('lower', Sequelize.col('name')), 'ASC']]
      : [[orderType, 'ASC']];

  const apps = await App.findAll({
    order,
    where,
  });

  // Status fields are admin-only — never expose infra health to guests.
  const data = req.isAuthenticated
    ? apps
    : apps.map((a) => redactAppForGuest(a.get({ plain: true })));

  // MDI paths for the icons in this response, so the client can draw them
  // without waiting for a follow-up GET /api/icons.
  const icons = iconPathsFor(apps.map((a) => a.icon));

  if (process.env.NODE_ENV === 'production') {
    // Set header to fetch containers info every time
    return res.status(200).setHeader('Cache-Control', 'no-store').json({
      success: true,
      data,
      icons,
    });
  }

  res.status(200).json({
    success: true,
    data,
    icons,
  });
});

getAllApps.redactAppForGuest = redactAppForGuest;
module.exports = getAllApps;
