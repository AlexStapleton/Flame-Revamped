const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');

// @desc      Get all apps
// @route     GET /api/apps
// @access    Public
const getAllApps = asyncWrapper(async (req, res, next) => {
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
    : apps.map((a) => {
        const o = a.get({ plain: true });
        delete o.status;
        delete o.statusCheckedAt;
        delete o.statusCheckEnabled;
        delete o.statusCheckUrl;
        return o;
      });

  if (process.env.NODE_ENV === 'production') {
    // Set header to fetch containers info every time
    return res.status(200).setHeader('Cache-Control', 'no-store').json({
      success: true,
      data,
    });
  }

  res.status(200).json({
    success: true,
    data,
  });
});

module.exports = getAllApps;
