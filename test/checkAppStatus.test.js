const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { mapResult, probe } = require('../utils/checkAppStatus');

test('any HTTP response (incl. 401/403/500) => online', () => {
  assert.strictEqual(mapResult({ ok: true, statusCode: 200 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 401 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 503 }), 'online');
});

test('a thrown request (timeout/refused/DNS) => offline', () => {
  assert.strictEqual(mapResult({ ok: false }), 'offline');
});

const TOTAL_BYTES = 20 * 1024 * 1024;

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  );

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);

// Serves a 20 MB streamed body to GET. `state` records whether the client tore
// the connection down before the body finished.
const bigBodyServer = ({ headStatus, headDestroy = false }) => {
  const state = { closed: null, finished: null, bytesSent: 0 };
  const chunk = Buffer.alloc(64 * 1024, 'a');
  const server = http.createServer((req, res) => {
    res.on('error', () => {});
    if (req.method === 'HEAD') {
      if (headDestroy) return req.socket.destroy();
      res.writeHead(headStatus);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    state.closed = new Promise((resolve) =>
      res.on('close', () => {
        state.finished = res.writableFinished;
        resolve();
      })
    );
    const pump = () => {
      while (state.bytesSent < TOTAL_BYTES) {
        state.bytesSent += chunk.length;
        if (!res.write(chunk)) return res.once('drain', pump);
      }
      res.end();
    };
    pump();
  });
  return { server, state };
};

test('HEAD 405 is reported as online quickly (any status counts)', async () => {
  const { server, state } = bigBodyServer({ headStatus: 405 });
  const port = await listen(server);
  try {
    const started = Date.now();
    const result = await probe(`http://127.0.0.1:${port}/`);
    const elapsed = Date.now() - started;

    assert.deepStrictEqual(result, { ok: true, statusCode: 405 });
    assert.ok(elapsed < 1000, `probe took ${elapsed}ms`);
    assert.strictEqual(state.closed, null, 'GET fallback should not have run');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('HEAD rejected at the socket level: GET fallback reads only headers of a 20 MB body', async () => {
  const { server, state } = bigBodyServer({ headDestroy: true });
  const port = await listen(server);
  try {
    const started = Date.now();
    const result = await probe(`http://127.0.0.1:${port}/`);
    const elapsed = Date.now() - started;

    assert.deepStrictEqual(result, { ok: true, statusCode: 200 });
    assert.ok(elapsed < 1000, `probe took ${elapsed}ms`);

    // The server must see the client drop the connection before the body ends.
    await withTimeout(state.closed, 2000, 'connection never closed');
    assert.strictEqual(state.finished, false, 'body was fully delivered');
    assert.ok(state.bytesSent < TOTAL_BYTES, 'server wrote the whole body');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('unreachable host => offline', async () => {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  const result = await probe(`http://127.0.0.1:${port}/`);
  assert.deepStrictEqual(result, { ok: false });
});
