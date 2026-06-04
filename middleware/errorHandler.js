const ErrorResponse = require('../utils/ErrorResponse');
const Logger = require('../utils/Logger');
const logger = new Logger();

const errorHandler = (err, req, res, next) => {
  const realMessage = err && err.message ? err.message : 'Server Error';

  // Always log the real message for operators.
  logger.log(realMessage.split(',')[0], 'ERROR');

  if (process.env.NODE_ENV == 'development') {
    console.log(err);
  }

  // "Operational" errors carry an explicit statusCode (e.g. ErrorResponse 4xx)
  // and a message safe to show the client. For anything else (unexpected 500s
  // like a DB or programming error) return a generic message in production so we
  // don't leak internal detail; keep the real message in development.
  const isOperational = err && typeof err.statusCode === 'number';
  const statusCode = isOperational ? err.statusCode : 500;
  const clientMessage =
    isOperational || process.env.NODE_ENV !== 'production'
      ? realMessage
      : 'Server Error';

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
  });
};

module.exports = errorHandler;
