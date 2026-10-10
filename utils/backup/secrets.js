// Config keys that must never appear in an export. The login password is
// process.env.PASSWORD (an env var, never stored in config.json), so the only
// secrets living in config.json are the weather API key and the Pi-hole
// passwords / API tokens (PIHOLE_SECRETS, keyed by Pi-hole id).
const SECRET_KEYS = ['WEATHER_API_KEY', 'PIHOLE_SECRETS'];

// Return a shallow copy of a config object with secret keys removed. Pure.
const stripSecrets = (configObj) => {
  const out = { ...configObj };
  for (const key of SECRET_KEYS) delete out[key];
  return out;
};

module.exports = { SECRET_KEYS, stripSecrets };
