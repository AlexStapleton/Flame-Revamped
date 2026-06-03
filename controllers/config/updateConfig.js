const asyncWrapper = require('../../middleware/asyncWrapper');
const loadConfig = require('../../utils/loadConfig');
const { writeFile } = require('fs/promises');

// @desc      Update config
// @route     PUT /api/config/
// @access    Public
const updateConfig = asyncWrapper(async (req, res, next) => {
  const existingConfig = await loadConfig();

  // Only allow updates to keys that already exist in the config, so arbitrary
  // keys can't be injected to pollute config.json.
  const updates = {};
  for (const key of Object.keys(req.body)) {
    if (Object.prototype.hasOwnProperty.call(existingConfig, key)) {
      updates[key] = req.body[key];
    }
  }

  const newConfig = {
    ...existingConfig,
    ...updates,
  };

  await writeFile('data/config.json', JSON.stringify(newConfig));

  res.status(200).send({
    success: true,
    data: newConfig,
  });
});

module.exports = updateConfig;
