const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

const signToken = require('../utils/signToken');
const verifyToken = require('../utils/verifyToken');
const fingerprint = require('../utils/passwordFingerprint');
const auth = require('../middleware/auth');

beforeEach(() => {
  process.env.SECRET = 'test-secret';
  process.env.PASSWORD = 'pw-A';
});

const isAuthed = (token) => {
  const req = {
    header: (n) =>
      n === 'Authorization-Flame' ? `Bearer ${token}` : undefined,
  };
  auth(req, {}, () => {});
  return req.isAuthenticated;
};

test('token verifies under the same password, fails after PASSWORD changes', () => {
  const token = signToken('1h');
  assert.strictEqual(verifyToken(token).app, 'flame');
  assert.strictEqual(isAuthed(token), true);

  process.env.PASSWORD = 'pw-B';
  assert.throws(() => verifyToken(token));
  assert.strictEqual(isAuthed(token), false);

  process.env.PASSWORD = 'pw-A';
  assert.strictEqual(isAuthed(token), true);
});

test('token without pwf is rejected', () => {
  const token = jwt.sign({ app: 'flame' }, process.env.SECRET);
  assert.throws(() => verifyToken(token));
  assert.strictEqual(isAuthed(token), false);
});

test('non-HS256 algorithm is rejected even with correct secret and pwf', () => {
  const token = jwt.sign(
    { app: 'flame', pwf: fingerprint() },
    process.env.SECRET,
    { algorithm: 'HS512' }
  );
  assert.throws(() => verifyToken(token));
  assert.strictEqual(isAuthed(token), false);
});

test('tampered pwf is rejected', () => {
  const bad = jwt.sign(
    { app: 'flame', pwf: fingerprint('other') },
    process.env.SECRET
  );
  assert.throws(() => verifyToken(bad));
  const short = jwt.sign({ app: 'flame', pwf: 'x' }, process.env.SECRET);
  assert.throws(() => verifyToken(short));
  const nonString = jwt.sign({ app: 'flame', pwf: 5 }, process.env.SECRET);
  assert.throws(() => verifyToken(nonString));
});

test('changing SECRET rejects previously issued tokens', () => {
  const token = signToken('1h');
  process.env.SECRET = 'rotated-secret';
  assert.throws(() => verifyToken(token));
  assert.strictEqual(isAuthed(token), false);
});

test('fingerprint does not leak the password and depends on SECRET', () => {
  const fp = fingerprint('hunter2-password', 's1');
  assert.ok(!fp.includes('hunter2'));
  assert.strictEqual(fp.length, 22);
  assert.notStrictEqual(fp, fingerprint('hunter2-password', 's2'));
  assert.notStrictEqual(fp, fingerprint('hunter3-password', 's1'));
  assert.strictEqual(fp, fingerprint('hunter2-password', 's1'));
});
