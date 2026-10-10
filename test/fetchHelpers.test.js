const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('node:http');
const os = require('os');
const path = require('path');
const fetchText = require('../utils/fetchText');
const { dockerGet } = require('../controllers/apps/docker/useDocker');
const { probe } = require('../utils/checkAppStatus');

// Starts `handler` on a TCP port (or a unix socket path) and returns its base.
const serve = (handler, socketPath) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    const onListen = () =>
      resolve({
        server,
        base: socketPath ? null : `http://127.0.0.1:${server.address().port}`,
      });
    if (socketPath) server.listen(socketPath, onListen);
    else server.listen(0, '127.0.0.1', onListen);
  });

test('fetchText returns the body, rejects non-2xx and oversized bodies', async () => {
  const { server, base } = await serve((req, res) => {
    if (req.url === '/ok') return res.end('{"version":"1.9.0"}');
    if (req.url === '/missing') {
      res.statusCode = 404;
      return res.end('nope');
    }
    res.end(Buffer.alloc(2048, 'a'));
  });
  try {
    assert.strictEqual(await fetchText(`${base}/ok`), '{"version":"1.9.0"}');
    await assert.rejects(fetchText(`${base}/missing`), /HTTP 404/);
    await assert.rejects(fetchText(`${base}/big`, { maxBytes: 1024 }), /larger than 1024/);
  } finally {
    server.close();
  }
});

test('fetchText times out on a server that never answers', async () => {
  const { server, base } = await serve(() => {});
  try {
    await assert.rejects(fetchText(`${base}/hang`, { timeoutMs: 200 }));
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('dockerGet reads JSON over a unix socket and over TCP', async () => {
  const sock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flame-sock-')), 'docker.sock');
  const handler = (req, res) => {
    if (req.url.startsWith('/containers/json?filters=')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([{ Id: 'abc' }]));
    }
    res.statusCode = 500;
    res.end('{}');
  };
  const unix = await serve(handler, sock);
  const tcp = await serve(handler);
  try {
    assert.deepStrictEqual(
      await dockerGet({
        url: 'http://localhost/containers/json?filters=%7B%7D',
        socketPath: sock,
      }),
      [{ Id: 'abc' }]
    );
    assert.deepStrictEqual(
      await dockerGet({ url: `${tcp.base}/containers/json?filters=%7B%7D` }),
      [{ Id: 'abc' }]
    );
    await assert.rejects(
      dockerGet({ url: 'http://localhost/other', socketPath: sock }),
      /HTTP 500/
    );
    await assert.rejects(dockerGet({ url: `${tcp.base}/other` }), /HTTP 500/);
  } finally {
    unix.server.close();
    tcp.server.close();
    fs.rmSync(path.dirname(sock), { recursive: true, force: true });
  }
});

test('probe accepts URLs with embedded credentials', async () => {
  const { server, base } = await serve((req, res) => {
    res.statusCode = 401;
    res.end();
  });
  try {
    const withCreds = base.replace('http://', 'http://user:pass@');
    assert.deepStrictEqual(await probe(withCreds), { ok: true, statusCode: 401 });
  } finally {
    server.close();
  }
});
