const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');

const {
  getWeather, updateWeather
} = require('../controllers/weather');

router
  .route('/')
  .get(getWeather);

// Protected: triggers an external API call using the stored key. Public access
// would let anyone burn the weather-API quota.
router
  .route('/update')
  .get(auth, requireAuth, updateWeather);


module.exports = router;