const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const App = require('../../models/App');
const { sequelize } = require('../../db');

// @desc      Reorder apps
// @route     PUT /api/apps/0/reorder
// @access    Public
const reorderApps = asyncWrapper(async (req, res, next) => {
  const apps = req.body?.apps;
  if (!Array.isArray(apps)) {
    return next(new ErrorResponse('apps must be an array', 400));
  }

  // One transaction, sequential updates: SQLite has a single writer, so this is
  // faster than parallel UPDATEs and all-or-nothing.
  await sequelize.transaction(async (t) => {
    for (const { id, orderId } of apps) {
      await App.update({ orderId }, { where: { id }, transaction: t });
    }
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderApps;
