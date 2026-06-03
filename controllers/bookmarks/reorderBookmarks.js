const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');

// @desc      Reorder bookmarks
// @route     PUT /api/bookmarks/0/reorder
// @access    Public
const reorderBookmarks = asyncWrapper(async (req, res, next) => {
  await Promise.all(
    req.body.bookmarks.map(({ id, orderId }) =>
      Bookmark.update({ orderId }, { where: { id } })
    )
  );

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderBookmarks;
