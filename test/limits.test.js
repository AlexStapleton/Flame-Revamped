const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.SECRET = 'test';
const api = require('../api');

let server;
let base;

before(async () => {
  server = http.createServer(api);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

test('unauthenticated JSON body over 100 kb is rejected with 413', async () => {
  const big = JSON.stringify({ token: 'x'.repeat(200 * 1024) });
  const res = await post('/api/auth/validate', big);
  assert.strictEqual(res.status, 413);
});

test('small unauthenticated JSON body is parsed and reaches auth (401)', async () => {
  const res = await post('/api/auth/validate', JSON.stringify({ token: 'x' }));
  assert.strictEqual(res.status, 401);
});

test('backup import accepts a ~2 MB body and reaches auth (401, not 413)', async () => {
  const big = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
  const res = await post('/api/backup/import', big);
  assert.strictEqual(res.status, 401);
});
