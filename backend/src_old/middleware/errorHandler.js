const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log full error details with Winston (includes stack trace)
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id || 'unauthenticated'
  });

  // Determine status code
  let status = err.status || 500;
  let message = err.message;

  // Handle specific error types
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'File too large. Max 5MB.';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = 'Unexpected file field.';
  } else if (err.message && err.message.includes('Invalid file type')) {
    status = 400;
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token.';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired.';
  }

  // In production, don't leak stack traces
  const errorResponse = {
    error: message || 'Internal server error'
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    errorResponse.stack = err.stack;
  }

  res.status(status).json(errorResponse);
};

module.exports = { errorHandler };