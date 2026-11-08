const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const loadConfig = require('../../utils/loadConfig');
const { piholes } = require('../../utils/pihole');

// One entry per configured Pi-hole, each with its own ok/error, so one down
// Pi-hole doesn't hide the others. Failures are logged by the client, once per
// real round trip, not once per poll. Pi-hole stats are only for logged-in
// users: guests get an empty list (not an error, so the homescreen loads
// normally) and Flame doesn't contact any Pi-hole on their behalf.
const buildHandler = ({ fresh, manager = piholes }) =>
  asyncWrapper(async (req, res) => {
    if (!req.isAuthenticated) {
      return res.status(200).json({ success: true, data: [] });
    }
    const results = await manager.getAll({ fresh });
    res.status(200).json({ success: true, data: results });
  });

// @desc      Get Pi-hole summaries (each cached for 30 seconds)
// @route     GET /api/pihole
// @access    Logged-in users (guests get an empty list)
const getPihole = buildHandler({ fresh: false });

// @desc      Fetch Pi-hole summaries now, bypassing the cache
// @route     GET /api/pihole/update
// @access    Private
const updatePihole = buildHandler({ fresh: true });

// Longest pause the widget can ask for (Pi-hole itself has no limit).
const MAX_DISABLE_SECONDS = 24 * 60 * 60;

// How long a click on the shield pauses blocking, from settings. 0 means
// until it is turned back on (sent to Pi-hole as no timer). Pure.
const disableTimer = (seconds) => {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, MAX_DISABLE_SECONDS);
};

const buildBlockingHandler = ({ manager = piholes, getConfig = loadConfig } = {}) =>
  asyncWrapper(async (req, res, next) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return next(new ErrorResponse('"enabled" must be true or false', 400));
    }
    const { piholeDisableSeconds } = await getConfig();
    const result = await manager.setBlocking(req.params.id, {
      enabled,
      timer: enabled ? null : disableTimer(piholeDisableSeconds),
    });
    if (!result) return next(new ErrorResponse('Pi-hole not found', 404));
    if (!result.ok) {
      return res.status(502).json({ success: false, error: result.error });
    }
    res.status(200).json({ success: true, data: result });
  });

// @desc      Turn blocking on, or off for the configured time
// @route     POST /api/pihole/:id/blocking  { enabled: boolean }
// @access    Private
const setPiholeBlocking = buildBlockingHandler();

module.exports = {
  getPihole,
  updatePihole,
  setPiholeBlocking,
  buildHandler,
  buildBlockingHandler,
  disableTimer,
};
