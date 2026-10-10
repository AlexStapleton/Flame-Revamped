const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCoreVersion,
  parseRemoteVersion,
  isAllowedRemoteUrl,
  createCachedLoader,
  SUCCESS_TTL_MS,
  FAILURE_TTL_MS,
} = require('../utils/versionCheck');

test('extractCoreVersion strips prefixes and suffixes', () => {
  assert.equal(extractCoreVersion('v2.8.0-rc1'), '2.8.0');
  assert.equal(extractCoreVersion(''), null);
  assert.equal(extractCoreVersion('nope'), null);
});

test('parseRemoteVersion reads JSON version', () => {
  assert.equal(parseRemoteVersion('{"name":"x","version":"3.1.4"}'), '3.1.4');
});

test('parseRemoteVersion reads VITE_APP_VERSION env line', () => {
  assert.equal(parseRemoteVersion('FOO=1\nVITE_APP_VERSION="2.9.1"\n'), '2.9.1');
});

test('parseRemoteVersion returns null for garbage', () => {
  assert.equal(parseRemoteVersion('<html>404</html>'), null);
  assert.equal(parseRemoteVersion('{"version":null}'), null);
  assert.equal(parseRemoteVersion(undefined), null);
});

test('isAllowedRemoteUrl scheme validation', () => {
  assert.equal(isAllowedRemoteUrl('https://example.com/p.json'), true);
  assert.equal(isAllowedRemoteUrl('http://example.com/p.json'), false);
  assert.equal(isAllowedRemoteUrl('http://example.com/p.json', { allowHttp: true }), true);
  for (const bad of ['file:///etc/passwd', 'ftp://x/y', 'javascript:alert(1)', 'data:,1', 'nonsense', '', null]) {
    assert.equal(isAllowedRemoteUrl(bad, { allowHttp: true }), false, String(bad));
  }
});

const make = (impl) => {
  let t = 1000;
  const state = { calls: 0, advance: (ms) => { t += ms; } };
  const get = createCachedLoader({
    load: async (k) => { state.calls++; return impl(k); },
    now: () => t,
  });
  return { get, state };
};

test('second call within TTL is served from cache', async () => {
  const { get, state } = make(() => '1.0.0');
  assert.equal(await get('u'), '1.0.0');
  assert.equal(await get('u'), '1.0.0');
  assert.equal(state.calls, 1);
  state.advance(SUCCESS_TTL_MS + 1);
  await get('u');
  assert.equal(state.calls, 2);
});

test('keys are cached independently', async () => {
  const { get, state } = make((k) => k);
  await get('a');
  await get('b');
  assert.equal(state.calls, 2);
});

test('force without auth does not bypass cache', async () => {
  const { get, state } = make(() => '1.0.0');
  await get('u');
  await get('u', { force: true, canForce: false });
  assert.equal(state.calls, 1);
});

test('authenticated force bypasses cache', async () => {
  const { get, state } = make(() => '1.0.0');
  await get('u');
  await get('u', { force: true, canForce: true });
  assert.equal(state.calls, 2);
});

test('failures are cached for 10 minutes', async () => {
  const { get, state } = make(() => { throw new Error('down'); });
  await assert.rejects(get('u'));
  await assert.rejects(get('u'));
  assert.equal(state.calls, 1);
  state.advance(FAILURE_TTL_MS + 1);
  await assert.rejects(get('u'));
  assert.equal(state.calls, 2);
});

test('concurrent calls share one fetch', async () => {
  const { get, state } = make(async () => '1.0.0');
  await Promise.all([get('u'), get('u'), get('u')]);
  assert.equal(state.calls, 1);
});
