const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');

const { getCalendar, updateCalendar } = require('../controllers/calendar/getCalendar');

// auth (not requireAuth) decides how much error detail to return, and whether
// events are shown at all when calendarHideFromGuests is on.
router.route('/').get(auth, getCalendar);

// Protected: skips the cache, so public access would let anyone make Flame
// download every calendar on every request.
router.route('/update').get(auth, requireAuth, updateCalendar);

module.exports = router;
