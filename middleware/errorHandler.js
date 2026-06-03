const ErrorResponse = require('../utils/ErrorResponse');
const Logger = require('../utils/Logger');
const logger = new Logger();

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err && err.message ? err.message : 'Server Error';

  logger.log(error.message.split(',')[0], 'ERROR');

  if (process.env.NODE_ENV == 'development') {
    console.log(err);
  }

  res.status(err && err.statusCode ? err.statusCode : 500).json({
    success: false,
    error: error.message,
  });
};

module.exports = errorHandler;
