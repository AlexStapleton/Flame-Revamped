const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.SECRET = 'test-secret';
const auth = require('../middleware/auth');

// Minimal req stub exposing the Authorization-Flame header the middleware reads.
const runAuth = (headerValue) => {
  const req = {
    header: (name) =>
      name === 'Authorization-Flame' ? headerValue : undefined,
  };
  let nextCalled = false;
  auth(req, {}, () => {
    nextCalled = true;
  });
  return { req, nextCalled };
};

test('valid bearer token marks the request authenticated', () => {
  const token = jwt.sign({ app: 'flame' }, process.env.SECRET);
  const { req, nextCalled } = runAuth(`Bearer ${token}`);
  assert.strictEqual(req.isAuthenticated, true);
  assert.ok(nextCalled, 'next() must be called');
});

test('missing header is unauthenticated but still calls next', () => {
  const { req, nextCalled } = runAuth(undefined);
  assert.strictEqual(req.isAuthenticated, false);
  assert.ok(nextCalled);
});

test('malformed / forged token is unauthenticated', () => {
  assert.strictEqual(runAuth('Bearer not.a.real.jwt').req.isAuthenticated, false);
  const wrongSecret = jwt.sign({ app: 'flame' }, 'different-secret');
  assert.strictEqual(
    runAuth(`Bearer ${wrongSecret}`).req.isAuthenticated,
    false
  );
});
