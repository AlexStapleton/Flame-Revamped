const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const Category = require('../../models/Category');
const { sequelize } = require('../../db');

// @desc      Reorder categories
// @route     PUT /api/categories/0/reorder
// @access    Public
const reorderCategories = asyncWrapper(async (req, res, next) => {
  const categories = req.body?.categories;
  if (!Array.isArray(categories)) {
    return next(new ErrorResponse('categories must be an array', 400));
  }

  // One transaction, sequential updates: SQLite has a single writer, so this is
  // faster than parallel UPDATEs and all-or-nothing.
  await sequelize.transaction(async (t) => {
    for (const { id, orderId } of categories) {
      await Category.update({ orderId }, { where: { id }, transaction: t });
    }
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});

module.exports = reorderCategories;
