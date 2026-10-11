// Config keys that must never appear in an export. The login password is
// process.env.PASSWORD (an env var, never stored in config.json), so the only
// secrets living in config.json are the weather API key, the Pi-hole
// passwords / API tokens (PIHOLE_SECRETS, keyed by Pi-hole id) and the private
// iCal links (CALENDAR_SECRETS, keyed by calendar id).
const SECRET_KEYS = ['WEATHER_API_KEY', 'PIHOLE_SECRETS', 'CALENDAR_SECRETS'];

// Return a shallow copy of a config object with secret keys removed. Pure.
const stripSecrets = (configObj) => {
  const out = { ...configObj };
  for (const key of SECRET_KEYS) delete out[key];
  return out;
};

module.exports = { SECRET_KEYS, stripSecrets };
