const jwt = require('jsonwebtoken');
const fingerprint = require('./passwordFingerprint');

// Cap token lifetime to the values the UI offers, so a client can't request an
// arbitrarily long-lived (or never-expiring) token by posting a custom duration.
const ALLOWED_DURATIONS = ['1h', '1d', '14d', '30d', '1y'];
const DEFAULT_DURATION = '14d';

const signToken = (expiresIn) => {
  const ttl = ALLOWED_DURATIONS.includes(expiresIn)
    ? expiresIn
    : DEFAULT_DURATION;
  return jwt.sign({ app: 'flame', pwf: fingerprint() }, process.env.SECRET, {
    expiresIn: ttl,
    algorithm: 'HS256',
  });
};

module.exports = signToken;
