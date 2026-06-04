// Index the bookmarks -> category foreign key. Every bookmarks/categories read
// joins/filters on categoryId, so this avoids a full table scan as the bookmark
// list grows. Cheap insurance even at startpage scale.
const up = async (query) => {
  await query.addIndex('bookmarks', ['categoryId'], {
    name: 'bookmarks_category_id',
  });
};

const down = async (query) => {
  await query.removeIndex('bookmarks', 'bookmarks_category_id');
};

module.exports = {
  up,
  down,
};
