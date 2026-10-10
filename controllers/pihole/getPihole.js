const asyncWrapper = require('../../middleware/asyncWrapper');
const { piholes } = require('../../utils/pihole');

// Guests only learn that a Pi-hole is unreachable. The detailed reason can name
// the Pi-hole host or address, so it is reserved for the logged-in admin.
const GENERIC_ERROR = 'Pi-hole is unreachable';

// One entry per configured Pi-hole, each with its own ok/error, so one down
// Pi-hole doesn't hide the others. Failures are logged by the client, once per
// real round trip, not once per poll.
const buildHandler = ({ fresh, manager = piholes }) =>
  asyncWrapper(async (req, res) => {
    const results = await manager.getAll({ fresh });
    res.status(200).json({
      success: true,
      data: req.isAuthenticated
        ? results
        : results.map((r) => (r.ok ? r : { ...r, error: GENERIC_ERROR })),
    });
  });

// @desc      Get Pi-hole summaries (each cached for 30 seconds)
// @route     GET /api/pihole
// @access    Public (error details only for the admin)
const getPihole = buildHandler({ fresh: false });

// @desc      Fetch Pi-hole summaries now, bypassing the cache
// @route     GET /api/pihole/update
// @access    Private
const updatePihole = buildHandler({ fresh: true });

module.exports = { getPihole, updatePihole, buildHandler, GENERIC_ERROR };
