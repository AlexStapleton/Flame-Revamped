const asyncWrapper = require('../../middleware/asyncWrapper');
const Bookmark = require('../../models/Bookmark');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');
const { bookmarkVisibility } = require('../../utils/bookmarkVisibility');

// Build findAll options. Columns are qualified with the Bookmark alias because the
// guest query joins categories, which also has name/orderId columns. Pure + testable.
const buildBookmarkQuery = (isAuthenticated, orderType, CategoryModel) => {
  const { where, include } = bookmarkVisibility(isAuthenticated, CategoryModel);

  const order =
    orderType == 'name'
      ? [[Sequelize.fn('lower', Sequelize.col('Bookmark.name')), 'ASC']]
      : [[orderType, 'ASC']];

  return { order, where, include };
};

// @desc      Get all bookmarks
// @route     GET /api/bookmarks
// @access    Public
const getAllBookmarks = asyncWrapper(async (req, res, next) => {
  const { useOrdering: orderType } = await loadConfig();

  const bookmarks = await Bookmark.findAll(
    buildBookmarkQuery(req.isAuthenticated, orderType)
  );

  res.status(200).json({
    success: true,
    data: bookmarks,
  });
});

getAllBookmarks.buildBookmarkQuery = buildBookmarkQuery;
module.exports = getAllBookmarks;
