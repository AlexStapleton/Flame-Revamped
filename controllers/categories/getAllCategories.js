const asyncWrapper = require('../../middleware/asyncWrapper');
const Category = require('../../models/Category');
const Bookmark = require('../../models/Bookmark');
const { Sequelize } = require('sequelize');
const loadConfig = require('../../utils/loadConfig');

// @desc      Get all categories
// @route     GET /api/categories
// @access    Public
const getAllCategories = asyncWrapper(async (req, res, next) => {
  const { useOrdering: orderType } = await loadConfig();

  // categories visibility
  const where = req.isAuthenticated ? {} : { isPublic: true };

  const order =
    orderType == 'name'
      ? [
          [Sequelize.fn('lower', Sequelize.col('Category.name')), 'ASC'],
          [Sequelize.fn('lower', Sequelize.col('bookmarks.name')), 'ASC'],
        ]
      : [
          [orderType, 'ASC'],
          [{ model: Bookmark, as: 'bookmarks' }, orderType, 'ASC'],
        ];

  // Note: the `section` column only exists on the tuna-combo fork's schema; on
  // legacy/revamped Flame it doesn't, so we don't filter by it (the old attempt
  // threw on every request and spammed a fallback warning).
  const categories = await Category.findAll({
    include: [{ model: Bookmark, as: 'bookmarks' }],
    order,
    where,
  });

  let output;
  if (req.isAuthenticated) {
    output = categories;
  } else {
    // filter out private bookmarks for unauthenticated clients
    output = categories
      .map((c) => c.get({ plain: true }))
      .map((c) => ({
        ...c,
        bookmarks: c.bookmarks.filter((b) => b.isPublic),
      }));
  }

  res.status(200).json({
    success: true,
    data: output,
  });
});

module.exports = getAllCategories;
