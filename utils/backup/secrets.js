// Config keys that must never appear in an export. The login password is
// process.env.PASSWORD (an env var, never stored in config.json), so the only
// secret living in config.json is the weather API key.
const SECRET_KEYS = ['WEATHER_API_KEY'];

// Return a shallow copy of a config object with secret keys removed. Pure.
const stripSecrets = (configObj) => {
  const out = { ...configObj };
  for (const key of SECRET_KEYS) delete out[key];
  return out;
};

module.exports = { SECRET_KEYS, stripSecrets };
