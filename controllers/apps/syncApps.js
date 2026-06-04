const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');
const syncContainers = require('../../utils/syncApps');

// @desc      Trigger an immediate Docker/Kubernetes app sync, then return apps
// @route     POST /api/apps/sync
// @access    Private
const syncApps = asyncWrapper(async (req, res, next) => {
  await syncContainers();

  const { useOrdering: orderType } = await loadConfig();

  const order =
    orderType == 'name'
      ? [[Sequelize.fn('lower', Sequelize.col('name')), 'ASC']]
      : [[orderType, 'ASC']];

  const apps = await App.findAll({ order });

  res.status(200).json({
    success: true,
    data: apps,
  });
});

module.exports = syncApps;
