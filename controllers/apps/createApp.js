const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const ErrorResponse = require('../../utils/ErrorResponse');
const { isDangerousUrl } = require('../../utils/urlSafety');
const loadConfig = require('../../utils/loadConfig');
const runStatusChecks = require('../../utils/runStatusChecks');

// @desc      Create new app
// @route     POST /api/apps
// @access    Public
const createApp = asyncWrapper(async (req, res, next) => {
  const { pinAppsByDefault } = await loadConfig();

  let body = { ...req.body };

  if (isDangerousUrl(body.url) || isDangerousUrl(body.statusCheckUrl)) {
    return next(new ErrorResponse('Invalid URL scheme', 400));
  }

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  const app = await App.create({
    ...body,
    isPinned: pinAppsByDefault,
  });

  // If created with a health check on, probe immediately (fire-and-forget).
  if (app.statusCheckEnabled) {
    runStatusChecks.checkOne(app);
  }

  res.status(201).json({
    success: true,
    data: app,
  });
});

module.exports = createApp;
