const { DataTypes } = require('sequelize');
const { STRING } = DataTypes;

// Which sync owns an app: null = created by hand, 'docker' or 'kubernetes' =
// discovered by that sync. Lets unpinStoppedApps unpin only apps its own source
// found, instead of every app.
const up = async (query) => {
  await query.addColumn('apps', 'source', {
    type: STRING,
    allowNull: true,
    defaultValue: null,
  });
  await query.addIndex('apps', ['source'], { name: 'apps_source' });
};

const down = async (query) => {
  await query.removeIndex('apps', 'apps_source');
  await query.removeColumn('apps', 'source');
};

module.exports = { up, down };
