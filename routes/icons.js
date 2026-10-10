const express = require('express');

const router = express.Router();

const { NAME_RE, loadMdi: defaultLoadMdi } = require('../utils/iconPaths');

const MAX_NAMES = 300;
const MAX_QUERY_LENGTH = 8 * 1024;

// Pure helper: validate a `names` query value and look the icons up.
// Returns { status: 400, error } or { status: 200, data }.
const resolveIcons = (rawNames, loadMdi = defaultLoadMdi) => {
  if (typeof rawNames !== 'string' || rawNames.length === 0) {
    return { status: 400, error: 'Query parameter "names" is required' };
  }
  if (rawNames.length > MAX_QUERY_LENGTH) {
    return { status: 400, error: 'Query parameter "names" is too long' };
  }

  const names = [...new Set(rawNames.split(','))];
  if (names.length > MAX_NAMES) {
    return { status: 400, error: `At most ${MAX_NAMES} icon names are allowed` };
  }
  if (!names.every((n) => NAME_RE.test(n))) {
    return { status: 400, error: 'Invalid icon name' };
  }

  const mdi = loadMdi();
  const data = {};
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(mdi, name) && typeof mdi[name] === 'string') {
      data[name] = mdi[name];
    }
  }
  return { status: 200, data };
};

const createIconsHandler = (loadMdi) => (req, res) => {
  const result = resolveIcons(req.query.names, loadMdi);
  if (result.status !== 200) {
    return res.status(result.status).json({ success: false, error: result.error });
  }
  // Paths only change when @mdi/js is upgraded.
  res.set('Cache-Control', 'public, max-age=86400');
  return res.status(200).json({ success: true, data: result.data });
};

router.get('/', createIconsHandler());

router.resolveIcons = resolveIcons;
router.createIconsHandler = createIconsHandler;
router.MAX_NAMES = MAX_NAMES;
router.MAX_QUERY_LENGTH = MAX_QUERY_LENGTH;

module.exports = router;
