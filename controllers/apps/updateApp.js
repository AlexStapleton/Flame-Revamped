const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const runStatusChecks = require('../../utils/runStatusChecks');

// Accept the value the form sends in any shape (boolean, 1/0 number, '1'/'0' string).
const isTruthyFlag = (v) => v === true || v === 1 || v === '1';

// @desc      Update app
// @route     PUT /api/apps/:id
// @access    Public
const updateApp = asyncWrapper(async (req, res, next) => {
  let app = await App.findOne({
    where: { id: req.params.id },
  });

  if (!app) {
    return next(
      new ErrorResponse(
        `App with the id of ${req.params.id} was not found`,
        404
      )
    );
  }

  let body = { ...req.body };

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  // If the health check is being turned off, clear stale status so no dot lingers.
  if ('statusCheckEnabled' in body && !isTruthyFlag(body.statusCheckEnabled)) {
    body.status = null;
    body.statusCheckedAt = null;
  }

  app = await app.update(body);

  // If enabled, probe immediately (fire-and-forget) so the dot populates promptly
  // instead of waiting for the next scheduled tick.
  if (app.statusCheckEnabled) {
    runStatusChecks.checkOne(app);
  }

  res.status(200).json({
    success: true,
    data: app,
  });
});

module.exports = updateApp;
