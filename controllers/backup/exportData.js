const asyncWrapper = require('../../middleware/asyncWrapper');
const { buildBackup } = require('../../utils/backup/serialize');

// @desc      Export all Flame data as a downloadable JSON backup
// @route     GET /api/backup/export
// @access    Private
const exportData = asyncWrapper(async (req, res, next) => {
  const envelope = await buildBackup();
  const date = new Date().toISOString().slice(0, 10);

  res
    .status(200)
    .setHeader('Content-Type', 'application/json')
    .setHeader(
      'Content-Disposition',
      `attachment; filename="flame-backup-${date}.json"`
    )
    .send(JSON.stringify(envelope, null, 2));
});

module.exports = exportData;
