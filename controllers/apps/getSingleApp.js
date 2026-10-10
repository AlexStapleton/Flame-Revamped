const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const { redactAppForGuest } = require('../../utils/redactApp');

// @desc      Get single app
// @route     GET /api/apps/:id
// @access    Public
const getSingleApp = asyncWrapper(async (req, res, next) => {
  const visibility = req.isAuthenticated ? {} : { isPublic: true };

  const app = await App.findOne({
    where: { id: req.params.id, ...visibility },
  });

  if (!app) {
    return next(
      new ErrorResponse(
        `App with the id of ${req.params.id} was not found`,
        404
      )
    );
  }

  res.status(200).json({
    success: true,
    // Status fields are admin-only — never expose infra health to guests.
    data: req.isAuthenticated ? app : redactAppForGuest(app.get({ plain: true })),
  });
});

module.exports = getSingleApp;
