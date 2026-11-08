const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');

const signToken = require('../utils/signToken');
const Weather = require('../models/Weather');
const getWeather = require('../controllers/weather/getWather');
const { applyConfigMigrations } = require('../utils/init/initConfig');
const initialConfig = require('../utils/init/initialConfig.json');
const Socket = require('../Socket');

beforeEach(() => {
  process.env.SECRET = 'test-secret';
  process.env.PASSWORD = 'pw-A';
});

const fakeRes = () => ({
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
});

const run = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = fakeRes();
    Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve(res)))).then(
      () => resolve(res),
      reject
    );
  });

// --- Weather API ----------------------------------------------------------

test('GET /api/weather gives guests an empty list without reading the DB', async (t) => {
  let reads = 0;
  t.mock.method(Weather, 'findAll', async () => {
    reads++;
    return [{ id: 1, tempC: 12 }];
  });
  const guest = await run(getWeather, { isAuthenticated: false });
  assert.strictEqual(guest.statusCode, 200);
  assert.deepStrictEqual(guest.body.data, []);
  assert.strictEqual(reads, 0);

  const admin = await run(getWeather, { isAuthenticated: true });
  assert.strictEqual(admin.body.data[0].tempC, 12);
});

// --- Calendar default + one-time migration ---------------------------------

test('new installs hide calendars from guests by default', () => {
  assert.strictEqual(initialConfig.calendarHideFromGuests, true);
});

test('migration hides calendars from guests once, then respects the admin', () => {
  const upgraded = applyConfigMigrations({ calendarHideFromGuests: false, hideSearch: true });
  assert.strictEqual(upgraded.calendarHideFromGuests, true);
  assert.strictEqual(upgraded.hideSearch, true);
  assert.deepStrictEqual(upgraded.appliedConfigMigrations, [
    'calendar-hidden-from-guests-by-default',
  ]);
  // The admin later chooses to show events: a restart must not undo it.
  const afterRestart = applyConfigMigrations({ ...upgraded, calendarHideFromGuests: false });
  assert.strictEqual(afterRestart.calendarHideFromGuests, false);
});

// --- Weather WebSocket ----------------------------------------------------

// A Flame socket on an ephemeral port, plus a helper that connects a client
// and records everything it receives and how it was closed.
const startSocket = async (opts) => {
  const server = http.createServer();
  const socket = new Socket(server, opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/socket`;
  const stop = async () => {
    clearInterval(socket.heartbeat);
    socket.webSocketServer.clients.forEach((c) => c.terminate());
    await new Promise((r) => socket.webSocketServer.close(r));
    await new Promise((r) => server.close(r));
  };
  return { socket, url, stop };
};

const connect = (url, firstMessage) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const client = { ws, messages: [], closeCode: null };
    client.closed = new Promise((r) =>
      ws.on('close', (code) => {
        client.closeCode = code;
        r(code);
      })
    );
    ws.on('message', (d) => client.messages.push(String(d)));
    ws.on('error', reject);
    ws.on('open', () => {
      if (firstMessage !== undefined) ws.send(firstMessage);
      resolve(client);
    });
  });

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

test('socket broadcasts weather only to clients that sent a valid token', async () => {
  const { socket, url, stop } = await startSocket();
  try {
    const authed = await connect(url, JSON.stringify({ type: 'auth', token: signToken('1h') }));
    const silent = await connect(url); // connected, never authenticates
    await tick();
    socket.send('{"tempC":12}');
    await tick();
    assert.deepStrictEqual(authed.messages, ['{"tempC":12}']);
    assert.deepStrictEqual(silent.messages, []);
  } finally {
    await stop();
  }
});

test('socket closes clients with a bad token or no token in time', async () => {
  const { url, stop } = await startSocket({ authTimeoutMs: 100 });
  try {
    const bad = await connect(url, JSON.stringify({ type: 'auth', token: 'not-a-jwt' }));
    const garbage = await connect(url, 'hello');
    const silent = await connect(url);
    assert.strictEqual(await bad.closed, Socket.CLOSE_AUTH_FAILED);
    assert.strictEqual(await garbage.closed, Socket.CLOSE_AUTH_FAILED);
    assert.strictEqual(await silent.closed, Socket.CLOSE_AUTH_TIMEOUT);
  } finally {
    await stop();
  }
});

test('socket stops sending to a client after the password changes', async () => {
  const { socket, url, stop } = await startSocket();
  try {
    const client = await connect(url, JSON.stringify({ type: 'auth', token: signToken('1h') }));
    await tick();
    process.env.PASSWORD = 'pw-B'; // tokens issued under pw-A are now invalid
    socket.send('{"tempC":13}');
    assert.strictEqual(await client.closed, Socket.CLOSE_AUTH_FAILED);
    assert.deepStrictEqual(client.messages, []);
  } finally {
    await stop();
  }
});
