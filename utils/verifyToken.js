const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fingerprint = require('./passwordFingerprint');

// Verifies signature (HS256 only), expiry, and that the token was issued under
// the current admin password. Returns the decoded payload or throws.
const verifyToken = (token) => {
  const decoded = jwt.verify(token, process.env.SECRET, {
    algorithms: ['HS256'],
  });

  if (!decoded || typeof decoded.pwf !== 'string') {
    throw new Error('Token has no password fingerprint');
  }

  const given = Buffer.from(decoded.pwf);
  const expected = Buffer.from(fingerprint());

  if (
    given.length !== expected.length ||
    !crypto.timingSafeEqual(given, expected)
  ) {
    throw new Error('Token does not match current password');
  }

  return decoded;
};

module.exports = verifyToken;
