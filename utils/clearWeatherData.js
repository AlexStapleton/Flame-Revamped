const { Op } = require('sequelize');
const Weather = require('../models/Weather');

// Keeps the newest row (highest id, the one getExternalWeather updates and the
// app reads) and removes older legacy rows.
const clearWeatherData = async ({ Model = Weather } = {}) => {
  const weather = await Model.findOne({
    order: [['id', 'DESC']],
  });

  if (weather) {
    await Model.destroy({
      where: {
        id: {
          [Op.lt]: weather.id,
        },
      },
    });
  }
};

module.exports = clearWeatherData;
