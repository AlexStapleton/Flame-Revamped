const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { login, validate } = require('../controllers/auth');
const requireBody = require('../middleware/requireBody');

// Throttle login attempts to slow password brute-forcing. Only failed attempts
// count toward the limit, so legitimate logins are never blocked.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again later.',
  },
});

router
  .route('/')
  .post(loginLimiter, requireBody(['password', 'duration']), login);

router.route('/validate').post(requireBody(['token']), validate);

module.exports = router;
