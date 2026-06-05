const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const { validateBackup } = require('../../utils/backup/validate');
const { applyBackup } = require('../../utils/backup/restore');

// @desc      Replace all Flame data from an uploaded backup JSON
// @route     POST /api/backup/import
// @access    Private
const importData = asyncWrapper(async (req, res, next) => {
  const { ok, error } = validateBackup(req.body);
  if (!ok) {
    return next(new ErrorResponse(error, 400));
  }

  const { safetyBackupPath } = await applyBackup(req.body);

  res.status(200).json({
    success: true,
    data: {
      message: 'Backup imported successfully.',
      safetyBackupPath,
    },
  });
});

module.exports = importData;
