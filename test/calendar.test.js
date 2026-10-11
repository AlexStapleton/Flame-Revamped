const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  createCalendarClient,
  createCalendarManager,
  readCalendars,
  normalizeFeedUrl,
  parseEvents,
  fetchFeed,
  CalendarError,
  MAX_CALENDARS,
} = require('../utils/calendar');
const { buildHandler, GENERIC_ERROR } = require('../controllers/calendar/getCalendar');
const { maskConfigForViewer } = require('../controllers/config/getConfig');
const { SECRET_KEYS } = require('../utils/backup/secrets');

// Sunday 11 October 2026, noon UTC. The parse window is a day before to nine
// days after: Sat 10 Oct 12:00Z to Tue 20 Oct 12:00Z.
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const WINDOW = { from: NOW - 24 * 3600e3, to: NOW + 9 * 24 * 3600e3 };

const vtimezone = (tzid) => `BEGIN:VTIMEZONE
TZID:${tzid}
BEGIN:DAYLIGHT
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
TZNAME:PDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
TZNAME:PST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const ics = (...parts) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...parts, 'END:VCALENDAR']
    .join('\r\n')
    .replace(/\r?\n/g, '\r\n');

const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\n');

// Google-style feed: a weekday stand-up since 2024 in Los Angeles time, with
// one day removed (EXDATE), one moved and renamed, one cancelled.
const GOOGLE = ics(
  vtimezone('America/Los_Angeles'),
  vevent([
    'UID:standup@test',
    'DTSTART;TZID=America/Los_Angeles:20240101T090000',
    'DTEND;TZID=America/Los_Angeles:20240101T091500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    'EXDATE;TZID=America/Los_Angeles:20261013T090000',
    'SUMMARY:Stand-up',
  ]),
  vevent([
    'UID:standup@test',
    'RECURRENCE-ID;TZID=America/Los_Angeles:20261015T090000',
    'DTSTART;TZID=America/Los_Angeles:20261015T140000',
    'DTEND;TZID=America/Los_Angeles:20261015T143000',
    'SUMMARY:Stand-up (moved)',
  ]),
  vevent([
    'UID:standup@test',
    'RECURRENCE-ID;TZID=America/Los_Angeles:20261016T090000',
    'DTSTART;TZID=America/Los_Angeles:20261016T090000',
    'DTEND;TZID=America/Los_Angeles:20261016T091500',
    'STATUS:CANCELLED',
    'SUMMARY:Stand-up',
  ])
);

test('recurring events: expanded, EXDATE skipped, overrides moved, cancelled dropped', () => {
  const events = parseEvents(GOOGLE, WINDOW);
  assert.deepStrictEqual(
    events.map((e) => [e.start, e.title]),
    [
      // 09:00 PDT = 16:00Z. Sat 10 and Sun 11 have no stand-up; Tue 13 is
      // excluded; Thu 15 moved to 14:00; Fri 16 cancelled; Tue 20 16:00Z is
      // past the window end (12:00Z).
      ['2026-10-12T16:00:00.000Z', 'Stand-up'],
      ['2026-10-14T16:00:00.000Z', 'Stand-up'],
      ['2026-10-15T21:00:00.000Z', 'Stand-up (moved)'],
      ['2026-10-19T16:00:00.000Z', 'Stand-up'],
    ]
  );
  assert.strictEqual(events[0].end, '2026-10-12T16:15:00.000Z');
  assert.strictEqual(events[0].allDay, false);
});

test('all-day, UTC, unknown TZID, floating and Windows-named zones', () => {
  const feed = ics(
    vtimezone('Pacific Standard Time'),
    vevent(['UID:1', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013', 'SUMMARY:Bin day']),
    vevent(['UID:2', 'DTSTART;VALUE=DATE:20261014', 'SUMMARY:No end']),
    vevent(['UID:3', 'DTSTART:20261011T150000Z', 'DTEND:20261011T160000Z', 'SUMMARY:UTC']),
    // Europe/London without a VTIMEZONE: resolved by name (BST, UTC+1).
    vevent(['UID:4', 'DTSTART;TZID=Europe/London:20261011T100000', 'SUMMARY:London']),
    // No zone at all: floating, shown in the viewer's local time.
    vevent(['UID:5', 'DTSTART:20261011T180000', 'DTEND:20261011T190000', 'SUMMARY:Floating']),
    // Outlook names zones the Windows way and defines them in a VTIMEZONE.
    vevent(['UID:6', 'DTSTART;TZID=Pacific Standard Time:20261013T100000', 'SUMMARY:Outlook']),
    vevent(['UID:7', 'DTSTART:20261001T100000Z', 'SUMMARY:Past']),
    vevent(['UID:8', 'DTSTART:20261101T100000Z', 'SUMMARY:Too far']),
    vevent(['UID:9', 'DTSTART:20261012T080000Z'])
  );
  const byTitle = Object.fromEntries(parseEvents(feed, WINDOW).map((e) => [e.title, e]));
  assert.deepStrictEqual(Object.keys(byTitle).sort(), [
    'Bin day',
    'Busy',
    'Floating',
    'London',
    'No end',
    'Outlook',
    'UTC',
  ]);
  assert.deepStrictEqual(
    [byTitle['Bin day'].start, byTitle['Bin day'].end, byTitle['Bin day'].allDay],
    ['2026-10-12', '2026-10-13', true]
  );
  assert.strictEqual(byTitle['No end'].end, '2026-10-15');
  assert.strictEqual(byTitle.UTC.start, '2026-10-11T15:00:00.000Z');
  assert.strictEqual(byTitle.London.start, '2026-10-11T09:00:00.000Z');
  assert.strictEqual(byTitle.London.end, byTitle.London.start);
  assert.strictEqual(byTitle.Floating.start, '2026-10-11T18:00:00');
  assert.strictEqual(byTitle.Floating.end, '2026-10-11T19:00:00');
  assert.strictEqual(byTitle.Outlook.start, '2026-10-13T17:00:00.000Z');
});

test('a series in a zone without a VTIMEZONE keeps its zone across DST', () => {
  // Europe/London, no VTIMEZONE: 09:00 is 08:00Z in BST and 09:00Z after the
  // clocks go back on Sun 25 Oct 2026.
  const feed = ics(
    vevent([
      'UID:s',
      'DTSTART;TZID=Europe/London:20250106T090000',
      'DTEND;TZID=Europe/London:20250106T091500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'SUMMARY:Stand-up',
    ])
  );
  const events = parseEvents(feed, { from: NOW, to: NOW + 20 * 24 * 3600e3 });
  assert.deepStrictEqual(
    events.map((e) => [e.start, e.end]),
    [
      ['2026-10-12T08:00:00.000Z', '2026-10-12T08:15:00.000Z'],
      ['2026-10-19T08:00:00.000Z', '2026-10-19T08:15:00.000Z'],
      ['2026-10-26T09:00:00.000Z', '2026-10-26T09:15:00.000Z'],
    ]
  );
});

test('an event already in progress and a multi-day event overlapping the window are kept', () => {
  const feed = ics(
    vevent(['UID:1', 'DTSTART:20261009T000000Z', 'DTEND:20261012T000000Z', 'SUMMARY:Trip']),
    vevent(['UID:2', 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261010', 'SUMMARY:Over'])
  );
  assert.deepStrictEqual(parseEvents(feed, WINDOW).map((e) => e.title), ['Trip']);
});

test('titles are cleaned and capped; the event count is capped', () => {
  const long = 'x'.repeat(500);
  const feed = ics(
    vevent(['UID:1', 'DTSTART:20261011T150000Z', `SUMMARY:  two\\nlines  `]),
    vevent(['UID:2', 'DTSTART:20261011T160000Z', `SUMMARY:${long}`]),
    vevent(['UID:3', 'DTSTART:20261011T170000Z', 'RRULE:FREQ=HOURLY', 'SUMMARY:Hourly'])
  );
  const events = parseEvents(feed, { ...WINDOW, limit: 20 });
  assert.strictEqual(events.length, 20);
  assert.strictEqual(events[0].title, 'two lines');
  assert.strictEqual(events[1].title.length, 200);
});

test('a runaway rule from long ago stops instead of hanging', () => {
  const feed = ics(
    vevent(['UID:1', 'DTSTART:19900101T000000Z', 'RRULE:FREQ=MINUTELY', 'SUMMARY:Spam'])
  );
  const started = Date.now();
  assert.deepStrictEqual(parseEvents(feed, WINDOW), []);
  assert.ok(Date.now() - started < 5000);
});

test('something that is not iCal gives a clear CalendarError', () => {
  assert.throws(() => parseEvents('<html>Sign in</html>', WINDOW), CalendarError);
  assert.throws(() => parseEvents('BEGIN:VCALENDAR\r\nnonsense', WINDOW), CalendarError);
  assert.throws(() => parseEvents(undefined, WINDOW), CalendarError);
});

test('normalizeFeedUrl accepts http(s) and webcal, rejects the rest', () => {
  assert.strictEqual(
    normalizeFeedUrl(' webcal://p01-caldav.icloud.com/published/2/abc '),
    'https://p01-caldav.icloud.com/published/2/abc'
  );
  assert.strictEqual(
    normalizeFeedUrl('https://calendar.google.com/calendar/ical/x/private-abc/basic.ics'),
    'https://calendar.google.com/calendar/ical/x/private-abc/basic.ics'
  );
  assert.strictEqual(normalizeFeedUrl('http://nextcloud.lan/remote.php/dav?export'), 'http://nextcloud.lan/remote.php/dav?export');
  for (const bad of ['', '   ', 'ftp://x/y.ics', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', null, 42]) {
    assert.strictEqual(normalizeFeedUrl(bad), null, String(bad));
  }
});

test('readCalendars validates entries, attaches links by id and caps the count', () => {
  const list = readCalendars({
    calendars: [
      { id: 'a', name: ' Personal ', color: '#FFB86E' },
      { id: 'b', name: '', color: 'red' },
      { id: 'a', name: 'Duplicate' },
      { id: 'c', name: 'No link' },
      { name: 'No id' },
      null,
    ],
    CALENDAR_SECRETS: { a: 'https://x/a.ics', b: 'webcal://x/b.ics', c: '' },
  });
  assert.deepStrictEqual(list, [
    { id: 'a', name: 'Personal', color: '#ffb86e', url: 'https://x/a.ics' },
    { id: 'b', name: 'Calendar', color: '#6ee2ff', url: 'https://x/b.ics' },
  ]);
  assert.deepStrictEqual(readCalendars({}), []);
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `c${i}` }));
  const secrets = Object.fromEntries(many.map((c) => [c.id, 'https://x/y.ics']));
  assert.strictEqual(
    readCalendars({ calendars: many, CALENDAR_SECRETS: secrets }).length,
    MAX_CALENDARS
  );
});

const SIMPLE = ics(vevent(['UID:1', 'DTSTART:20261011T150000Z', 'SUMMARY:Dentist']));

test('client caches for the TTL and shares one in-flight download', async () => {
  let t = NOW;
  let downloads = 0;
  const client = createCalendarClient({
    now: () => t,
    fetchText: async () => {
      downloads++;
      await new Promise((r) => setImmediate(r));
      return SIMPLE;
    },
  });
  const [a, b] = await Promise.all([client.getEvents('u'), client.getEvents('u')]);
  assert.strictEqual(downloads, 1);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, [
    { title: 'Dentist', start: '2026-10-11T15:00:00.000Z', end: '2026-10-11T15:00:00.000Z', allDay: false },
  ]);
  t += 60e3;
  await client.getEvents('u');
  assert.strictEqual(downloads, 1);
  await client.getEvents('u', { fresh: true });
  assert.strictEqual(downloads, 2);
  t += 10 * 60e3;
  await client.getEvents('u');
  assert.strictEqual(downloads, 3);
  await client.getEvents('other');
  assert.strictEqual(downloads, 4);
});

test('client errors are cached, logged once and never contain the link', async () => {
  const logged = [];
  const secretUrl = 'https://calendar.google.com/calendar/ical/me/private-SECRET/basic.ics';
  const client = createCalendarClient({
    now: () => NOW,
    onError: (e) => logged.push(e.message),
    fetchText: async (url) => {
      throw new TypeError(`fetch failed for ${url}`);
    },
  });
  await assert.rejects(client.getEvents(secretUrl), (e) => {
    assert.ok(e instanceof CalendarError);
    assert.ok(!e.message.includes('SECRET'));
    return true;
  });
  await assert.rejects(client.getEvents(secretUrl), CalendarError);
  assert.strictEqual(logged.length, 1);
});

test('manager merges calendars; one failing does not hide the others', async () => {
  const config = {
    calendars: [
      { id: 'home', name: 'Home', color: '#ffb86e' },
      { id: 'work', name: 'Work', color: '#6ee2ff' },
      { id: 'gone', name: 'Gone' },
    ],
    CALENDAR_SECRETS: { home: 'https://h/a.ics', work: 'https://w/b.ics', gone: 'https://g/c.ics' },
  };
  const feeds = {
    'https://h/a.ics': ics(vevent(['UID:1', 'DTSTART:20261012T090000Z', 'SUMMARY:Later'])),
    'https://w/b.ics': ics(vevent(['UID:2', 'DTSTART:20261011T150000Z', 'SUMMARY:Sooner'])),
  };
  const manager = createCalendarManager({
    getConfig: async () => config,
    clientFactory: () =>
      createCalendarClient({
        now: () => NOW,
        onError: () => {},
        fetchText: async (url) => {
          if (!feeds[url]) throw new CalendarError('Calendar answered with HTTP 500');
          return feeds[url];
        },
      }),
  });
  const { calendars, events } = await manager.getAll();
  assert.deepStrictEqual(calendars, [
    { id: 'home', name: 'Home', color: '#ffb86e', ok: true },
    { id: 'work', name: 'Work', color: '#6ee2ff', ok: true },
    { id: 'gone', name: 'Gone', color: '#6ee2ff', ok: false, error: 'Calendar answered with HTTP 500' },
  ]);
  assert.deepStrictEqual(
    events.map((e) => [e.calendarId, e.title]),
    [
      ['work', 'Sooner'],
      ['home', 'Later'],
    ]
  );
});

// Controller, with a fake response object.
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

const fakeManager = {
  getAll: async () => ({
    calendars: [
      { id: 'a', name: 'Home', color: '#ffb86e', ok: true },
      { id: 'b', name: 'Work', color: '#6ee2ff', ok: false, error: "Can't reach the calendar (ENOTFOUND)" },
    ],
    events: [{ calendarId: 'a', title: 'Dentist', start: '2026-10-11T15:00:00.000Z', end: '2026-10-11T15:00:00.000Z', allDay: false }],
  }),
};

test('handler hides error detail from guests', async () => {
  const handler = buildHandler({
    fresh: false,
    manager: fakeManager,
    getConfig: async () => ({ calendarHideFromGuests: false }),
  });
  const guest = await runHandler(handler, false);
  assert.strictEqual(guest.statusCode, 200);
  assert.strictEqual(guest.body.data.events.length, 1);
  assert.strictEqual(guest.body.data.calendars[1].error, GENERIC_ERROR);
  const admin = await runHandler(handler, true);
  assert.match(admin.body.data.calendars[1].error, /ENOTFOUND/);
});

test('calendarHideFromGuests shows nothing to guests but everything to the admin', async () => {
  let downloads = 0;
  const handler = buildHandler({
    fresh: false,
    manager: { getAll: async () => (downloads++, fakeManager.getAll()) },
    getConfig: async () => ({ calendarHideFromGuests: true }),
  });
  const guest = await runHandler(handler, false);
  assert.deepStrictEqual(guest.body.data, { calendars: [], events: [] });
  assert.strictEqual(downloads, 0);
  const admin = await runHandler(handler, true);
  assert.strictEqual(admin.body.data.events.length, 1);
});

test('calendar links are masked for guests and are a backup secret', () => {
  const cfg = {
    calendars: [{ id: 'a', name: 'Home', color: '#ffb86e' }],
    CALENDAR_SECRETS: { a: 'https://x/private.ics' },
  };
  const guest = maskConfigForViewer(cfg, false);
  assert.deepStrictEqual(guest.calendars, [{ id: 'a', name: 'Home', color: '#ffb86e' }]);
  assert.deepStrictEqual(guest.CALENDAR_SECRETS, {});
  assert.deepStrictEqual(maskConfigForViewer({}, false).calendars, []);
  assert.strictEqual(maskConfigForViewer(cfg, true).CALENDAR_SECRETS.a, 'https://x/private.ics');
  assert.ok(SECRET_KEYS.includes('CALENDAR_SECRETS'));
  // Hidden from guests: not even the calendar names.
  const hidden = { ...cfg, calendarHideFromGuests: true };
  assert.deepStrictEqual(maskConfigForViewer(hidden, false).calendars, []);
  assert.strictEqual(maskConfigForViewer(hidden, true).calendars.length, 1);
});

// fetchFeed against a real local HTTP server.
const withServer = async (handler, fn) => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

test('fetchFeed returns the body, follows redirects, and keeps the link out of errors', async () => {
  await withServer(
    (req, res) => {
      if (req.url === '/old') {
        res.writeHead(302, { Location: '/private-SECRET.ics' });
        return res.end();
      }
      if (req.url === '/private-SECRET.ics') {
        res.writeHead(200, { 'Content-Type': 'text/calendar' });
        return res.end(SIMPLE);
      }
      if (req.url === '/big') {
        res.writeHead(200);
        const chunk = Buffer.alloc(1024 * 1024, 'x');
        for (let i = 0; i < 11; i++) res.write(chunk);
        return res.end();
      }
      res.writeHead(404);
      res.end('nope');
    },
    async (base) => {
      assert.strictEqual(await fetchFeed(`${base}/old`), SIMPLE);
      await assert.rejects(fetchFeed(`${base}/missing-SECRET`), (e) => {
        assert.ok(e instanceof CalendarError);
        assert.match(e.message, /HTTP 404/);
        assert.ok(!e.message.includes('SECRET'));
        return true;
      });
      await assert.rejects(fetchFeed(`${base}/big`), /too large/);
    }
  );
  await assert.rejects(fetchFeed('http://127.0.0.1:1/private-SECRET.ics'), (e) => {
    assert.ok(e instanceof CalendarError);
    assert.ok(!e.message.includes('SECRET'));
    return true;
  });
});
