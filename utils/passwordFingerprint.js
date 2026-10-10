const crypto = require('crypto');

// Keyed fingerprint of the admin password, embedded in every token as `pwf`.
// HMAC (keyed with SECRET) so the claim, which is readable in the JWT payload,
// can't be used for offline guessing of the password. Changing PASSWORD (or
// SECRET) changes the fingerprint and thereby invalidates issued tokens.
const fingerprint = (
  password = process.env.PASSWORD,
  secret = process.env.SECRET
) =>
  crypto
    .createHmac('sha256', String(secret))
    .update('flame-pwd-v1:' + String(password))
    .digest('base64url')
    .slice(0, 22);

module.exports = fingerprint;
