const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  createPiholeClient,
  createPiholeManager,
  readInstances,
  normalizeBaseUrl,
  mapStats,
  mapStatsV5,
  requestJson,
  PiholeError,
  MAX_PIHOLES,
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

const V6 = { baseUrl: 'http://pi.hole', version: 6, password: 'app-pw', insecure: false };

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

test('logs in once and reuses the session across refreshes', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({ request: fake.request, now: () => t });
  const first = await client.getStats(V6);
  assert.strictEqual(first.queries, 12345);
  assert.strictEqual(first.blocking, 'enabled');
  t += 60 * 1000; // past the cache window
  await client.getStats(V6);
  assert.strictEqual(fake.state.logins, 1);
});

test('caches for the TTL and shares one in-flight request', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({ request: fake.request, now: () => t });
  await Promise.all([client.getStats(V6), client.getStats(V6), client.getStats(V6)]);
  const callsAfterFirst = fake.state.calls.length;
  t += 10 * 1000;
  await client.getStats(V6);
  assert.strictEqual(fake.state.calls.length, callsAfterFirst);
  // fresh bypasses the cache
  await client.getStats(V6, { fresh: true });
  assert.ok(fake.state.calls.length > callsAfterFirst);
  assert.strictEqual(fake.state.logins, 1);
});

test('logs in again when Pi-hole expires the session', async () => {
  const fake = fakePihole();
  let t = 0;
  const client = createPiholeClient({ request: fake.request, now: () => t });
  await client.getStats(V6);
  fake.state.validSids.clear(); // session expired on the Pi-hole side
  t += 60 * 1000;
  const stats = await client.getStats(V6);
  assert.strictEqual(stats.queries, 12345);
  assert.strictEqual(fake.state.logins, 2);
});

test('works when Pi-hole has no password (no sid)', async () => {
  const fake = fakePihole({ noPassword: true });
  const client = createPiholeClient({ request: fake.request });
  const stats = await client.getStats({ ...V6, password: '' });
  assert.strictEqual(stats.blocked, 1234);
});

test('a wrong password throws a PiholeError, is cached and logged once', async () => {
  const fake = fakePihole();
  const errors = [];
  const client = createPiholeClient({
    request: fake.request,
    now: () => 0,
    onError: (e) => errors.push(e),
  });
  const bad = { ...V6, password: 'wrong' };
  await assert.rejects(client.getStats(bad), (err) => {
    assert.ok(err instanceof PiholeError);
    assert.match(err.message, /rejected the password/);
    return true;
  });
  await assert.rejects(client.getStats(bad), PiholeError);
  assert.strictEqual(fake.state.logins, 1);
  assert.strictEqual(errors.length, 1);
});

test('network errors become PiholeErrors', async () => {
  const client = createPiholeClient({
    request: async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.2:80');
    },
    onError: () => {},
  });
  await assert.rejects(client.getStats(V6), (err) => {
    assert.ok(err instanceof PiholeError);
    assert.match(err.message, /Can't reach Pi-hole/);
    return true;
  });
});

test('changing settings logs out the old session and logs in again', async () => {
  const fake = fakePihole();
  const client = createPiholeClient({ request: fake.request });
  await client.getStats(V6);
  await client.getStats({ ...V6, baseUrl: 'http://pi.hole:8080' });
  assert.strictEqual(fake.state.logins, 2);
  assert.strictEqual(fake.state.logouts, 1);
});

// v5: GET /admin/api.php?summaryRaw&auth=TOKEN; bad token -> 200 [].
const V5_RAW = {
  domains_being_blocked: 120000,
  dns_queries_today: 5000,
  ads_blocked_today: 750,
  ads_percentage_today: 15,
  status: 'disabled',
};
const fakeV5 = (token = 'tok en') => {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.pathname !== '/admin/api.php' || !u.searchParams.has('summaryRaw')) {
      return { status: 404, data: null };
    }
    return { status: 200, data: u.searchParams.get('auth') === token ? V5_RAW : [] };
  };
  return { urls, request };
};
const V5 = { baseUrl: 'http://old.pi', version: 5, password: 'tok en', insecure: false };

test('mapStatsV5 maps the v5 fields', () => {
  assert.deepStrictEqual(mapStatsV5(V5_RAW), {
    queries: 5000,
    blocked: 750,
    percentBlocked: 15,
    domainsBlocked: 120000,
    blocking: 'disabled',
  });
  assert.strictEqual(mapStatsV5({ status: 'weird' }).blocking, 'unknown');
});

test('v5 sends the token (URL-encoded) and maps the summary', async () => {
  const fake = fakeV5();
  const client = createPiholeClient({ request: fake.request });
  const stats = await client.getStats(V5);
  assert.strictEqual(stats.blocked, 750);
  assert.strictEqual(stats.blocking, 'disabled');
  assert.match(fake.urls[0], /^http:\/\/old\.pi\/admin\/api\.php\?summaryRaw&auth=tok%20en$/);
});

test('v5 wrong or missing token is reported without leaking it', async () => {
  const client = createPiholeClient({ request: fakeV5().request, onError: () => {} });
  await assert.rejects(client.getStats({ ...V5, password: 'nope' }), (err) => {
    assert.match(err.message, /rejected the API token/);
    assert.ok(!err.message.includes('nope'));
    return true;
  });
  const client2 = createPiholeClient({ request: fakeV5().request, onError: () => {} });
  await assert.rejects(client2.getStats({ ...V5, password: '' }), /needs an API token/);
});

test('v5 against a non-v5 host gives a clear error', async () => {
  const client = createPiholeClient({
    request: async () => ({ status: 200, data: { something: 'else' } }),
    onError: () => {},
  });
  await assert.rejects(client.getStats(V5), /is it v5/);
});

// Several Pi-holes.
test('readInstances validates entries and attaches secrets by id', () => {
  const out = readInstances({
    piholes: [
      { id: 'a', name: ' Main ', url: 'http://pi.hole/admin', version: 6 },
      { id: 'b', name: '', url: 'http://10.0.0.3', version: 5, skipTlsVerify: true },
      { id: 'a', name: 'dup', url: 'http://x' },
      { id: 'c', name: 'bad url', url: 'ftp://x' },
      { name: 'no id', url: 'http://x' },
      null,
    ],
    PIHOLE_SECRETS: { a: 'pw-a', b: 'tok-b' },
  });
  assert.deepStrictEqual(out, [
    {
      id: 'a',
      name: 'Main',
      settings: { baseUrl: 'http://pi.hole', version: 6, password: 'pw-a', insecure: false },
    },
    {
      id: 'b',
      name: 'Pi-hole',
      settings: { baseUrl: 'http://10.0.0.3', version: 5, password: 'tok-b', insecure: true },
    },
  ]);
  assert.deepStrictEqual(readInstances({}), []);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, url: 'http://x' }));
  assert.strictEqual(readInstances({ piholes: many }).length, MAX_PIHOLES);
});

test('manager returns one entry per Pi-hole; one failing does not hide the other', async () => {
  const v6 = fakePihole();
  const v5 = fakeV5('tok-b');
  const request = (url, opts) =>
    new URL(url).hostname === 'pi.hole' ? v6.request(url, opts) : v5.request(url, opts);
  let config = {
    piholes: [
      { id: 'a', name: 'Main', url: 'http://pi.hole', version: 6 },
      { id: 'b', name: 'Backup', url: 'http://old.pi', version: 5 },
    ],
    PIHOLE_SECRETS: { a: 'app-pw', b: 'wrong' },
  };
  const manager = createPiholeManager({
    getConfig: async () => config,
    clientFactory: () => createPiholeClient({ request, onError: () => {} }),
  });
  const out = await manager.getAll();
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(
    out.map((r) => [r.id, r.name, r.ok]),
    [['a', 'Main', true], ['b', 'Backup', false]]
  );
  assert.strictEqual(out[0].queries, 12345);
  assert.match(out[1].error, /rejected the API token/);

  // Removing a Pi-hole logs its v6 session out.
  config = { ...config, piholes: [config.piholes[1]] };
  const after = await manager.getAll();
  assert.deepStrictEqual(after.map((r) => r.id), ['b']);
  assert.strictEqual(v6.state.logouts, 1);
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
  const manager = {
    getAll: async () => [
      { id: 'a', name: 'Main', ok: true, queries: 1 },
      { id: 'b', name: 'Backup', ok: false, error: "Can't reach Pi-hole: connect ECONNREFUSED 10.0.0.2:80" },
    ],
  };
  const handler = buildHandler({ fresh: false, manager });
  const guest = await runHandler(handler, false);
  assert.strictEqual(guest.statusCode, 200);
  assert.strictEqual(guest.body.data[0].queries, 1);
  assert.strictEqual(guest.body.data[1].error, GENERIC_ERROR);
  const admin = await runHandler(handler, true);
  assert.match(admin.body.data[1].error, /10\.0\.0\.2/);
});

test('Pi-hole addresses and secrets are masked for guests; secrets are a backup secret', () => {
  const cfg = {
    piholes: [{ id: 'a', name: 'Main', url: 'http://10.0.0.2', version: 6 }],
    PIHOLE_SECRETS: { a: 'pw' },
  };
  const guest = maskConfigForViewer(cfg, false);
  assert.deepStrictEqual(guest.piholes, [{ id: 'a', name: 'Main' }]);
  assert.deepStrictEqual(guest.PIHOLE_SECRETS, {});
  assert.deepStrictEqual(maskConfigForViewer({}, false).piholes, []);
  assert.strictEqual(maskConfigForViewer(cfg, true).PIHOLE_SECRETS.a, 'pw');
  assert.ok(SECRET_KEYS.includes('PIHOLE_SECRETS'));
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
