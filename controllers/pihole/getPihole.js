const asyncWrapper = require('../../middleware/asyncWrapper');
const { pihole, PiholeError } = require('../../utils/pihole');

// Guests only learn that Pi-hole is unreachable. The detailed reason can name
// the Pi-hole host or address, so it is reserved for the logged-in admin.
const GENERIC_ERROR = 'Pi-hole is unreachable';

// Pi-hole failures are answered here rather than through errorHandler, which
// logs every error: the widget polls, so that would log once per tab per
// minute. The client logs each real failure once instead.
const buildHandler = ({ fresh, client = pihole }) =>
  asyncWrapper(async (req, res) => {
    try {
      const stats = await client.getStats({ fresh });
      res.status(200).json({
        success: true,
        data: stats.configured ? stats : null,
      });
    } catch (err) {
      if (!(err instanceof PiholeError)) throw err;
      res.status(502).json({
        success: false,
        error: req.isAuthenticated ? err.message : GENERIC_ERROR,
      });
    }
  });

// @desc      Get Pi-hole summary (cached for 30 seconds)
// @route     GET /api/pihole
// @access    Public (error details only for the admin)
const getPihole = buildHandler({ fresh: false });

// @desc      Fetch Pi-hole summary now, bypassing the cache
// @route     GET /api/pihole/update
// @access    Private
const updatePihole = buildHandler({ fresh: true });

module.exports = { getPihole, updatePihole, buildHandler, GENERIC_ERROR };
