const { DataTypes } = require('sequelize');
const { INTEGER, STRING, DATE } = DataTypes;

const up = async (query) => {
  await query.addColumn('apps', 'statusCheckEnabled', {
    type: INTEGER,
    allowNull: true,
    defaultValue: 0,
  });
  await query.addColumn('apps', 'statusCheckUrl', {
    type: STRING,
    allowNull: true,
    defaultValue: null,
  });
  await query.addColumn('apps', 'status', {
    type: STRING,
    allowNull: true,
    defaultValue: null,
  });
  await query.addColumn('apps', 'statusCheckedAt', {
    type: DATE,
    allowNull: true,
    defaultValue: null,
  });
};

const down = async (query) => {
  await query.removeColumn('apps', 'statusCheckEnabled');
  await query.removeColumn('apps', 'statusCheckUrl');
  await query.removeColumn('apps', 'status');
  await query.removeColumn('apps', 'statusCheckedAt');
};

module.exports = { up, down };
