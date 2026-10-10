const { test } = require('node:test');
const assert = require('node:assert');
const useDocker = require('../controllers/apps/docker/useDocker');

const { buildDockerRequest } = useDocker;
const FILTER = encodeURIComponent(JSON.stringify({ status: ['running'] }));

test('localhost (no scheme) uses the unix socket', () => {
  const req = buildDockerRequest('localhost');
  assert.strictEqual(req.socketPath, '/var/run/docker.sock');
  assert.strictEqual(
    req.url,
    `http://localhost/containers/json?filters=${FILTER}`
  );
});

test('localhost with a port (no scheme) still uses the unix socket', () => {
  const req = buildDockerRequest('localhost:2375');
  assert.strictEqual(req.socketPath, '/var/run/docker.sock');
  assert.ok(req.url.startsWith('http://localhost:2375/containers/json?'));
});

test('bare remote host is plain http with no socket', () => {
  const req = buildDockerRequest('10.0.0.5:2375');
  assert.strictEqual(req.socketPath, undefined);
  assert.strictEqual(
    req.url,
    `http://10.0.0.5:2375/containers/json?filters=${FILTER}`
  );
});

test('explicit https scheme is used as the base URL', () => {
  const req = buildDockerRequest('https://docker.lan:2376');
  assert.strictEqual(req.socketPath, undefined);
  assert.strictEqual(
    req.url,
    `https://docker.lan:2376/containers/json?filters=${FILTER}`
  );
});

test('explicit http scheme on localhost does not use the socket', () => {
  const req = buildDockerRequest('http://localhost:2375');
  assert.strictEqual(req.socketPath, undefined);
  assert.strictEqual(
    req.url,
    `http://localhost:2375/containers/json?filters=${FILTER}`
  );
});

test('trailing slashes are stripped from the base URL', () => {
  assert.strictEqual(
    buildDockerRequest('https://docker.lan:2376/').url,
    `https://docker.lan:2376/containers/json?filters=${FILTER}`
  );
  assert.strictEqual(
    buildDockerRequest('10.0.0.5:2375///').url,
    `http://10.0.0.5:2375/containers/json?filters=${FILTER}`
  );
});

test('filters query is URL-encoded JSON for running containers', () => {
  const { url } = buildDockerRequest('10.0.0.5:2375');
  const params = new URL(url).searchParams;
  assert.strictEqual(params.get('filters'), '{"status":["running"]}');
  assert.strictEqual(new URL(url).pathname, '/containers/json');
});
