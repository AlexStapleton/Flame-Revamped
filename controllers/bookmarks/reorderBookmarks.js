const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Bookmark = require('../../models/Bookmark');
const { sequelize } = require('../../db');

// @desc      Reorder bookmarks
// @route     PUT /api/bookmarks/0/reorder
// @access    Public
const reorderBookmarks = asyncWrapper(async (req, res, next) => {
  const bookmarks = req.body?.bookmarks;
  if (!Array.isArray(bookmarks)) {
    return next(new ErrorResponse('bookmarks must be an array', 400));
  }

  // One transaction, sequential updates: SQLite has a single writer, so this is
  // faster than parallel UPDATEs and all-or-nothing.
  await sequelize.transaction(async (t) => {
    for (const { id, orderId } of bookmarks) {
      await Bookmark.update({ orderId }, { where: { id }, transaction: t });
    }
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderBookmarks;
