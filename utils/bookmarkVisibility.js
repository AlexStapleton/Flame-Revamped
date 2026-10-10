const Category = require('../models/Category');

// Guests may only see a bookmark if both it AND its parent category are public.
// Returns the extra findAll/findOne options (where + include) to apply. For
// authenticated users nothing is restricted. Requires associateModels() to have run.
const bookmarkVisibility = (isAuthenticated, CategoryModel = Category) => {
  if (isAuthenticated) return { where: {}, include: [] };
  return {
    where: { isPublic: true },
    include: [
      {
        model: CategoryModel,
        attributes: [],
        where: { isPublic: true },
        required: true,
      },
    ],
  };
};

module.exports = { bookmarkVisibility };
