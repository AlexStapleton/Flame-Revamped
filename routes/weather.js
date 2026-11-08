const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');

const {
  getWeather, updateWeather
} = require('../controllers/weather');

// auth (not requireAuth): guests get an empty list instead of an error, so the
// homescreen loads normally. Weather is only shown to logged-in users.
router
  .route('/')
  .get(auth, getWeather);

// Protected: triggers an external API call using the stored key. Public access
// would let anyone burn the weather-API quota.
router
  .route('/update')
  .get(auth, requireAuth, updateWeather);


module.exports = router;