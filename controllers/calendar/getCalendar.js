const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { calendars } = require('../../utils/calendar');

// Guests only learn that a calendar couldn't be loaded. The detailed reason
// can describe the calendar host, so it is reserved for the logged-in admin.
const GENERIC_ERROR = 'Calendar could not be loaded';

// Events from every calendar, merged, plus one status entry per calendar so
// one broken link doesn't hide the others. With calendarHideFromGuests on,
// visitors who aren't logged in get nothing.
const buildHandler = ({ fresh, manager = calendars, getConfig = loadConfig }) =>
  asyncWrapper(async (req, res) => {
    if (!req.isAuthenticated) {
      const { calendarHideFromGuests } = await getConfig();
      if (calendarHideFromGuests) {
        return res.status(200).json({
          success: true,
          data: { calendars: [], events: [] },
        });
      }
    }
    const { calendars: list, events } = await manager.getAll({ fresh });
    res.status(200).json({
      success: true,
      data: {
        calendars: req.isAuthenticated
          ? list
          : list.map((c) => (c.ok ? c : { ...c, error: GENERIC_ERROR })),
        events,
      },
    });
  });

// @desc      Get upcoming events (each calendar cached for 5 minutes)
// @route     GET /api/calendar
// @access    Public unless calendarHideFromGuests (error details only for the admin)
const getCalendar = buildHandler({ fresh: false });

// @desc      Fetch every calendar now, bypassing the cache
// @route     GET /api/calendar/update
// @access    Private
const updateCalendar = buildHandler({ fresh: true });

module.exports = { getCalendar, updateCalendar, buildHandler, GENERIC_ERROR };
