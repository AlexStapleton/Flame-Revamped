const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.SECRET = 'test-secret';
const signToken = require('../utils/signToken');

const ttlOf = (token) => {
  const decoded = jwt.verify(token, process.env.SECRET);
  return decoded.exp - decoded.iat;
};

test('an allow-listed duration is honored', () => {
  assert.strictEqual(ttlOf(signToken('1h')), 60 * 60);
});

test('a non-allow-listed duration falls back to the 14d default', () => {
  // Without the allow-list this would mint a ~10-year token.
  assert.strictEqual(ttlOf(signToken('3650d')), 14 * 24 * 60 * 60);
});

test('an undefined duration falls back to the 14d default', () => {
  assert.strictEqual(ttlOf(signToken(undefined)), 14 * 24 * 60 * 60);
});
