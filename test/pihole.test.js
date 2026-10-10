const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  createPiholeClient,
  normalizeBaseUrl,
  mapStats,
  requestJson,
  PiholeError,
} = require('../utils/pihole');
const { buildHandler, GENERIC_ERROR } = require('../controllers/pihole/getPihole');
const { maskConfigForViewer } = require('../controllers/config/getConfig');
const { SECRET_KEYS } = require('../utils/backup/secrets');

const SUMMARY = {
  queries: { total: 12345, blocked: 1234, percent_blocked: 9.996 },
  gravity: { domains_being_blocked: 150000, last_update: 1 },
};

// Fake Pi-hole v6: tracks logins and expires sessions on demand.
const fakePihole = ({ password = 'app-pw', noPassword = false } = {}) => {
  const state = { logins: 0, logouts: 0, calls: [], validSids: new Set() };
  const request = async (url, opts = {}) => {
    const { pathname } = new URL(url);
    const method = opts.method || 'GET';
    state.calls.push(`${method} ${pathname}`);
    if (pathname === '/api/auth' && method === 'POST') {
      state.logins++;
      if (noPassword) return { status: 200, data: { session: { valid: true, sid: null } } };
      if (opts.body.password !== password) {
        return { status: 401, data: { session: { valid: false, sid: null } } };
      }
      const sid = `sid-${state.logins}`;
      state.validSids.add(sid);
      return { status: 200, data: { session: { valid: true, sid, validity: 1800 } } };
    }
    if (pathname === '/api/auth' && method === 'DELETE') {
      state.logouts++;
      state.validSids.delete(opts.headers['X-FTL-SID']);
      return { status: 204, data: null };
    }
    const sid = opts.headers && opts.headers['X-FTL-SID'];
    if (!noPassword && !state.validSids.has(sid)) {
      return { status: 401, data: { error: { key: 'unauthorized' } } };
    }
    if (pathname === '/api/stats/summary') return { status: 200, data: SUMMARY };
    if (pathname === '/api/dns/blocking') {
      return { status: 200, data: { blocking: 'enabled', timer: null } };
    }
    return { status: 404, data: null };
  };
  return { state, request };
};

const configOf = (overrides = {}) => async () => ({
  piholeUrl: 'http://pi.hole',
  PIHOLE_PASSWORD: 'app-pw',
  piholeSkipTlsVerify: false,
  ...overrides,
});

test('normalizeBaseUrl accepts common forms and rejects non-http', () => {
  assert.strictEqual(normalizeBaseUrl('http://pi.hole'), 'http://pi.hole');
  assert.strictEqual(normalizeBaseUrl(' http://pi.hole/ '), 'http://pi.hole');
  assert.strictEqual(normalizeBaseUrl('http://192.168.1.2/admin/'), 'http://192.168.1.2');
  assert.strictEqual(normalizeBaseUrl('https://pi.hole:8443/api'), 'https://pi.hole:8443');
  assert.strictEqual(normalizeBaseUrl('http://host/pihole/admin'), 'http://host/pihole');
  assert.strictEqual(normalizeBaseUrl('http://u:p@pi.hole?x=1#y'), 'http://pi.hole');
  assert.strictEqual(normalizeBaseUrl(''), null);
  assert.strictEqual(normalizeBaseUrl('pi.hole'), null);
  assert.strictEqual(normalizeBaseUrl('file:///etc/passwd'), null);
  assert.strictEqual(normalizeBaseUrl(undefined), null);
});

test('mapStats maps the v6 fields and tolerates missing ones', () => {
  assert.deepStrictEqual(mapStats(SUMMARY, { blocking: 'disabled' }), {
    queries: 12345,
    blocked: 1234,
    percentBlocked: 9.996,
    domainsBlocked: 150000,
    blocking: 'disabled',
  });
  assert.deepStrictEqual(mapStats(null, null), {
    queries: 0,
    blocked: 0,
    percentBlocked: 0,
    domainsBlocked: 0,
    blocking: 'unknown',
  });
});

test('returns configured:false without calling Pi-hole when no URL is set', async () => {
  const fake = fakePihole();
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf({ piholeUrl: '' }),
  });
  assert.deepStrictEqual(await client.getStats(), { configured: false });
  assert.strictEqual(fake.state.calls.length, 0);
});

test('logs in once and reuses the session across refreshes', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf(),
    now: () => t,
  });
  const first = await client.getStats();
  assert.strictEqual(first.configured, true);
  assert.strictEqual(first.queries, 12345);
  assert.strictEqual(first.blocking, 'enabled');
  t += 60 * 1000; // past the cache window
  await client.getStats();
  assert.strictEqual(fake.state.logins, 1);
});

test('caches for the TTL and shares one in-flight request', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf(),
    now: () => t,
  });
  await Promise.all([client.getStats(), client.getStats(), client.getStats()]);
  const callsAfterFirst = fake.state.calls.length;
  t += 10 * 1000;
  await client.getStats();
  assert.strictEqual(fake.state.calls.length, callsAfterFirst);
  // fresh bypasses the cache
  await client.getStats({ fresh: true });
  assert.ok(fake.state.calls.length > callsAfterFirst);
  assert.strictEqual(fake.state.logins, 1);
});

test('logs in again when Pi-hole expires the session', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf(),
    now: () => t,
  });
  await client.getStats();
  fake.state.validSids.clear(); // session expired on the Pi-hole side
  t += 60 * 1000;
  const stats = await client.getStats();
  assert.strictEqual(stats.queries, 12345);
  assert.strictEqual(fake.state.logins, 2);
});

test('works when Pi-hole has no password (no sid)', async () => {
  const fake = fakePihole({ noPassword: true });
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf({ PIHOLE_PASSWORD: '' }),
  });
  const stats = await client.getStats();
  assert.strictEqual(stats.blocked, 1234);
});

test('a wrong password throws a PiholeError, is cached and logged once', async () => {
  const fake = fakePihole();
  const errors = [];
  const client = createPiholeClient({
    request: fake.request,
    getConfig: configOf({ PIHOLE_PASSWORD: 'wrong' }),
    now: () => 0,
    onError: (e) => errors.push(e),
  });
  await assert.rejects(client.getStats(), (err) => {
    assert.ok(err instanceof PiholeError);
    assert.match(err.message, /rejected the password/);
    return true;
  });
  await assert.rejects(client.getStats(), PiholeError);
  assert.strictEqual(fake.state.logins, 1);
  assert.strictEqual(errors.length, 1);
});

test('network errors become PiholeErrors', async () => {
  const client = createPiholeClient({
    request: async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.2:80');
    },
    getConfig: configOf(),
    onError: () => {},
  });
  await assert.rejects(client.getStats(), (err) => {
    assert.ok(err instanceof PiholeError);
    assert.match(err.message, /Can't reach Pi-hole/);
    return true;
  });
});

test('changing settings logs out the old session and logs in again', async () => {
  const fake = fakePihole();
  let url = 'http://pi.hole';
  const client = createPiholeClient({
    request: fake.request,
    getConfig: async () => ({ piholeUrl: url, PIHOLE_PASSWORD: 'app-pw' }),
  });
  await client.getStats();
  url = 'http://pi.hole:8080';
  await client.getStats();
  assert.strictEqual(fake.state.logins, 2);
  assert.strictEqual(fake.state.logouts, 1);
});

// Controller: guests get a generic error, the admin gets the real reason.
const runHandler = async (handler, isAuthenticated) => {
  const res = {
    statusCode: null,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  await new Promise((resolve, reject) => {
    const r = handler({ isAuthenticated }, res, (err) => (err ? reject(err) : resolve()));
    Promise.resolve(r).then(resolve, reject);
  });
  return res;
};

test('handler hides error detail from guests', async () => {
  const client = {
    getStats: async () => {
      throw new PiholeError("Can't reach Pi-hole: connect ECONNREFUSED 10.0.0.2:80");
    },
  };
  const handler = buildHandler({ fresh: false, client });
  const guest = await runHandler(handler, false);
  assert.strictEqual(guest.statusCode, 502);
  assert.strictEqual(guest.body.error, GENERIC_ERROR);
  const admin = await runHandler(handler, true);
  assert.match(admin.body.error, /10\.0\.0\.2/);
});

test('handler returns null data when Pi-hole is not configured', async () => {
  const handler = buildHandler({
    fresh: false,
    client: { getStats: async () => ({ configured: false }) },
  });
  const res = await runHandler(handler, false);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data, null);
});

test('Pi-hole password and URL are masked for guests; password is a backup secret', () => {
  const cfg = { PIHOLE_PASSWORD: 'pw', piholeUrl: 'http://10.0.0.2' };
  const guest = maskConfigForViewer(cfg, false);
  assert.strictEqual(guest.PIHOLE_PASSWORD, 'true');
  assert.strictEqual(guest.piholeUrl, 'true');
  assert.strictEqual(maskConfigForViewer({ piholeUrl: '' }, false).piholeUrl, '');
  assert.strictEqual(maskConfigForViewer(cfg, true).PIHOLE_PASSWORD, 'pw');
  assert.ok(SECRET_KEYS.includes('PIHOLE_PASSWORD'));
});

// requestJson against a real local HTTP server.
test('requestJson posts JSON, sends headers and parses the reply', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, sid: req.headers['x-ftl-sid'], body }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await requestJson(`http://127.0.0.1:${port}/api/auth`, {
      method: 'POST',
      headers: { 'X-FTL-SID': 'abc' },
      body: { password: 'x' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.method, 'POST');
    assert.strictEqual(res.data.sid, 'abc');
    assert.deepStrictEqual(JSON.parse(res.data.body), { password: 'x' });
  } finally {
    server.close();
  }
});

test('requestJson gives data null for a non-JSON reply', async () => {
  const server = http.createServer((req, res) => res.end('<html>'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await requestJson(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.data, null);
  } finally {
    server.close();
  }
});
