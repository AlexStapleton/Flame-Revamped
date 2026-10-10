const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.SECRET = 'test';
const { resolveIcons, MAX_NAMES, MAX_QUERY_LENGTH } = require('../routes/icons');

const fake = () => ({ mdiDocker: 'M1', mdiCancel: 'M2', mdiNotString: 5 });

test('resolveIcons returns paths and omits unknown names', () => {
  const r = resolveIcons('mdiDocker,mdiNope,mdiCancel', fake);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data, { mdiDocker: 'M1', mdiCancel: 'M2' });
});

test('resolveIcons dedupes names', () => {
  const r = resolveIcons('mdiDocker,mdiDocker', fake);
  assert.deepStrictEqual(r.data, { mdiDocker: 'M1' });
});

test('resolveIcons rejects missing, empty and invalid names', () => {
  for (const v of [undefined, '', ['a'], 'docker', 'mdi', 'mdiDocker,', 'mdidocker', 'mdiA-b', '__proto__', 'mdiDocker,constructor']) {
    assert.strictEqual(resolveIcons(v, fake).status, 400, String(v));
  }
});

test('resolveIcons ignores inherited and non-string members', () => {
  const r = resolveIcons('mdiToString,mdiNotString', fake);
  assert.deepStrictEqual(r.data, {});
});

test('resolveIcons enforces name count and query length caps', () => {
  const ok = Array.from({ length: MAX_NAMES }, (_, i) => `mdiA${i}`).join(',');
  assert.strictEqual(resolveIcons(ok, fake).status, 200);
  assert.strictEqual(resolveIcons(`${ok},mdiB`, fake).status, 400);
  assert.strictEqual(resolveIcons('mdi' + 'A'.repeat(MAX_QUERY_LENGTH), fake).status, 400);
});

test('resolveIcons does not load @mdi/js for invalid input', () => {
  let loaded = false;
  resolveIcons('bad', () => {
    loaded = true;
    return {};
  });
  assert.strictEqual(loaded, false);
});

test('GET /api/icons serves paths with cache header; 400 on bad input', async () => {
  const api = require('../api');
  const server = http.createServer(api);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/icons?names=mdiDocker,mdiCancel,mdiDoesNotExist`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=86400');
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.mdiDocker && body.data.mdiCancel);
    assert.strictEqual('mdiDoesNotExist' in body.data, false);

    const bad = await fetch(`${base}/api/icons?names=nope`);
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).success, false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
