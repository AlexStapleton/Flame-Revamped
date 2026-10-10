const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const ErrorResponse = require('../../utils/ErrorResponse');
const { isDangerousUrl } = require('../../utils/urlSafety');

// @desc      Create new bookmark
// @route     POST /api/bookmarks
// @access    Public
const createBookmark = asyncWrapper(async (req, res, next) => {
  let bookmark;

  if (isDangerousUrl(req.body.url)) {
    return next(new ErrorResponse('Invalid URL scheme', 400));
  }

  let body = {
    ...req.body,
    categoryId: parseInt(req.body.categoryId),
  };

  if (body.icon) {
    body.icon = body.icon.trim();
  }

  if (req.file) {
    body.icon = req.file.filename;
  }

  bookmark = await Bookmark.create(body);

  res.status(201).json({
    success: true,
    data: bookmark,
  });
});

module.exports = createBookmark;
