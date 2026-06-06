const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { writeFile } = require('fs/promises');

// Keep only the keys from `body` that already exist in `existingConfig`, so a
// request can't inject arbitrary keys to pollute config.json. Pure + testable.
const pickKnownKeys = (existingConfig, body) => {
  const updates = {};
  for (const key of Object.keys(body || {})) {
    if (Object.prototype.hasOwnProperty.call(existingConfig, key)) {
      updates[key] = body[key];
    }
  }
  return updates;
};

// @desc      Update config
// @route     PUT /api/config/
// @access    Public
const updateConfig = asyncWrapper(async (req, res, next) => {
  const existingConfig = await loadConfig();

  const updates = pickKnownKeys(existingConfig, req.body);

  const newConfig = {
    ...existingConfig,
    ...updates,
  };

  await writeFile('data/config.json', JSON.stringify(newConfig));

  // Keep the in-memory config cache in sync so the next read doesn't hit disk
  // and doesn't serve a stale value.
  loadConfig.setCache(newConfig);

  res.status(200).send({
    success: true,
    data: newConfig,
  });
});

updateConfig.pickKnownKeys = pickKnownKeys;
module.exports = updateConfig;
