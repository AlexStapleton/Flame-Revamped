const { test } = require('node:test');
const assert = require('node:assert');
const healthRouter = require('../routes/health');

const { createHealthHandler } = healthRouter;

// Guards the public /health endpoint: it must be a cheap liveness check that
// never leaks log contents or exception details.

const fakeRes = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  return res;
};

const ok = async () => {};
const fail = async () => {
  throw new Error('boom: /app/secret/path');
};

test('healthy when config and db checks pass', async () => {
  const handler = createHealthHandler({ checkConfig: ok, checkDb: ok });
  const res = fakeRes();
  await handler({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { status: 'healthy', errors: [] });
  assert.strictEqual(res.headers['Cache-Control'], 'no-store');
});

test('503 with generic message when config.json is missing', async () => {
  const handler = createHealthHandler({ checkConfig: fail, checkDb: ok });
  const res = fakeRes();
  await handler({ query: {} }, res);
  assert.strictEqual(res.statusCode, 503);
  assert.deepStrictEqual(res.body, {
    status: 'unhealthy',
    errors: ['Missing config.json'],
  });
  assert.ok(!JSON.stringify(res.body).includes('/app/secret'));
});

test('503 when the db check rejects, without leaking the error', async () => {
  const handler = createHealthHandler({ checkConfig: ok, checkDb: fail });
  const res = fakeRes();
  await handler({ query: {} }, res);
  assert.strictEqual(res.statusCode, 503);
  assert.deepStrictEqual(res.body, {
    status: 'unhealthy',
    errors: ['Database unreachable'],
  });
  assert.ok(!JSON.stringify(res.body).includes('boom'));
});

test('503 when the db check hangs past the timeout', async () => {
  const hang = () => new Promise(() => {});
  const handler = createHealthHandler({
    checkConfig: ok,
    checkDb: hang,
    timeoutMs: 20,
  });
  const res = fakeRes();
  const started = Date.now();
  await handler({ query: {} }, res);
  assert.ok(Date.now() - started < 1000, 'handler should not hang');
  assert.strictEqual(res.statusCode, 503);
  assert.deepStrictEqual(res.body.errors, ['Database unreachable']);
});

test('debug query param does not add fields to the body', async () => {
  const handler = createHealthHandler({ checkConfig: ok, checkDb: ok });
  const res = fakeRes();
  await handler({ query: { debug: 'true' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.body).sort(), ['errors', 'status']);
});
