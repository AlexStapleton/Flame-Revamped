const ICAL = require('ical.js');
const loadConfig = require('./loadConfig');
const Logger = require('./Logger');

const logger = new Logger();

// Calendar widget: reads each calendar's private iCal link (Google's "Secret
// address in iCal format", Outlook's published ICS link, iCloud, Nextcloud...)
// on Flame's server and hands the browser only the events it shows. The link
// itself is a password (anyone holding it can read the whole calendar), so it
// lives in CALENDAR_SECRETS and never reaches visitors, logs or error messages.

const REQUEST_TIMEOUT_MS = 15 * 1000;
// Busy calendars with years of history can be several MB.
const MAX_BODY_BYTES = 10 * 1024 * 1024;
// Calendar providers refresh their published feeds slowly (Google every few
// hours), so a few minutes is plenty and keeps big feeds cheap to serve.
const CACHE_TTL_MS = 5 * 60 * 1000;
// Events are expanded from a day ago (the browser may be ahead of or behind
// the server, and "Today" starts at local midnight) to the furthest day the
// Upcoming section can show plus one.
const WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 9 * 24 * 60 * 60 * 1000;
// Guards against runaway rules (e.g. a minutely RRULE from 1990).
const MAX_ITERATIONS = 50000;
const MAX_EVENTS_PER_CALENDAR = 300;
const MAX_TITLE_LENGTH = 200;
const MAX_CALENDARS = 10;

class CalendarError extends Error {}

// Turn what the user pasted into the URL to fetch. webcal:// is just a hint to
// open a calendar app; the feed itself is served over https. Returns null for
// anything else. Pure.
const normalizeFeedUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  if (/^webcals?:\/\//i.test(text)) text = text.replace(/^webcals?:/i, 'https:');
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href;
};

// GET the feed as text. Messages never include the URL, because the URL is
// the secret.
const fetchFeed = async (url) => {
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'text/calendar, */*;q=0.5' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new CalendarError('Calendar took too long to answer');
    }
    const code = err && err.cause && err.cause.code;
    throw new CalendarError(
      code ? `Can't reach the calendar (${code})` : "Can't reach the calendar"
    );
  }
  if (!res.ok) {
    if (res.body) await res.body.cancel().catch(() => {});
    throw new CalendarError(
      res.status === 401 || res.status === 403 || res.status === 404
        ? `Calendar link was refused (HTTP ${res.status}). Check that it is the secret iCal address.`
        : `Calendar answered with HTTP ${res.status}`
    );
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new CalendarError('Calendar is too large (over 10 MB)');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

// Offset of `timeZone` from UTC at the instant `ms`, in ms. Pure.
const tzOffsetMs = (ms, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
};

const isIanaZone = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Wall-clock time in an IANA zone -> epoch ms. Pure.
const wallTimeToMs = (t, timeZone) => {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  let ms = guess - tzOffsetMs(guess, timeZone);
  // Second pass gets the right side of a DST change.
  ms = guess - tzOffsetMs(ms, timeZone);
  return ms;
};

const pad = (n) => String(n).padStart(2, '0');

// One ICAL.Time -> what the browser gets, plus an approximate epoch ms used
// only to filter by the window and sort:
// - all-day: "YYYY-MM-DD" (a date in the viewer's own calendar)
// - timed with a known zone: an ISO instant ("...Z")
// - floating (no zone, or one we can't resolve): "YYYY-MM-DDTHH:MM:SS", which
//   the browser reads as its own local time, as RFC 5545 intends.
// `fallbackTz` is the TZID of the series' DTSTART: occurrences that ical.js
// generates from a rule don't carry a TZID it couldn't resolve.
const convertTime = (t, fallbackTz) => {
  if (t.isDate) {
    const value = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
    return { value, ms: Date.UTC(t.year, t.month - 1, t.day), allDay: true };
  }
  const zone = t.zone;
  if (zone && zone.tzid && zone.tzid !== 'floating') {
    const ms = t.toUnixTime() * 1000;
    return { value: new Date(ms).toISOString(), ms, allDay: false };
  }
  // TZID names a zone the feed didn't define in a VTIMEZONE.
  const tzid = t.timezone || fallbackTz;
  if (isIanaZone(tzid)) {
    const ms = wallTimeToMs(t, tzid);
    return { value: new Date(ms).toISOString(), ms, allDay: false };
  }
  const value = `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(
    t.minute
  )}:${pad(t.second)}`;
  return {
    value,
    ms: Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second),
    allDay: false,
  };
};

const cleanTitle = (summary) => {
  const text = typeof summary === 'string' ? summary.replace(/\s+/g, ' ').trim() : '';
  return (text || 'Busy').slice(0, MAX_TITLE_LENGTH);
};

const isCancelled = (event) => {
  const status = event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
};

// Build one output event, or null when it falls outside [from, to). Pure.
const toOutput = (item, startTime, endTime, from, to, fallbackTz) => {
  if (isCancelled(item)) return null;
  const start = convertTime(startTime, fallbackTz);
  // No DTEND/DURATION: an all-day event lasts one day, a timed one is a point.
  let end;
  if (endTime && endTime.compare(startTime) > 0) {
    end = convertTime(endTime, fallbackTz);
  } else if (start.allDay) {
    const next = startTime.clone();
    next.adjust(1, 0, 0, 0);
    end = convertTime(next, fallbackTz);
  } else {
    end = start;
  }
  const endMs = end.ms > start.ms ? end.ms : start.ms + 1;
  if (endMs <= from || start.ms >= to) return null;
  return {
    title: cleanTitle(item.summary),
    start: start.value,
    end: end.value,
    allDay: start.allDay,
    sortMs: start.ms,
  };
};

// Parse an iCal feed and list the events (recurring ones expanded) that
// overlap [from, to) (epoch ms). Throws CalendarError on a feed that isn't
// iCal. Pure apart from registering the feed's VTIMEZONEs with ical.js.
const parseEvents = (text, { from, to, limit = MAX_EVENTS_PER_CALENDAR } = {}) => {
  if (typeof text !== 'string' || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new CalendarError('Link did not return an iCal calendar');
  }
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (err) {
    throw new CalendarError('Calendar could not be read (invalid iCal)');
  }
  if (root.name !== 'vcalendar') {
    root = root.getFirstSubcomponent('vcalendar');
    if (!root) throw new CalendarError('Link did not return an iCal calendar');
  }

  // Must happen before any DTSTART is read, so times resolve to their zone.
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      // A broken VTIMEZONE: times in it fall back to the TZID name below.
    }
  }

  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map();
  const exceptions = [];
  const singles = [];
  for (const vevent of vevents) {
    let event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue;
    }
    if (!event.startDate) continue;
    if (vevent.hasProperty('recurrence-id')) exceptions.push(event);
    else if (event.isRecurring()) masters.set(event.uid, event);
    else singles.push(event);
  }
  // Overrides of one occurrence (moved or renamed) attach to their series; an
  // override whose series isn't in the feed stands on its own.
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex);
  }

  const out = [];
  for (const event of singles) {
    const e = toOutput(event, event.startDate, event.endDate, from, to);
    if (e) out.push(e);
  }

  for (const master of masters.values()) {
    let iterator;
    try {
      iterator = master.iterator();
    } catch {
      continue;
    }
    // Occurrences come in start order, but a moved occurrence can land later
    // than its slot, so keep going a little past the window.
    const stopAt = to + 7 * 24 * 60 * 60 * 1000;
    const seriesTz = master.startDate.timezone;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let next;
      try {
        next = iterator.next();
      } catch {
        break;
      }
      if (!next) break;
      if (convertTime(next, seriesTz).ms >= stopAt) break;
      let details;
      try {
        details = master.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      const e = toOutput(
        details.item,
        details.startDate,
        details.endDate,
        from,
        to,
        details.item.startDate.timezone || seriesTz
      );
      if (e) out.push(e);
    }
  }

  out.sort((a, b) => a.sortMs - b.sortMs || a.title.localeCompare(b.title));
  return out.slice(0, limit);
};

// Client for ONE calendar: caches the expanded events so many open dashboards
// cost one download per window.
const createCalendarClient = ({
  fetchText = fetchFeed,
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  onError = (err) => logger.log(`Calendar: ${err.message}`, 'WARN'),
} = {}) => {
  let cache = null; // { at, url, value } or { at, url, error }
  let inFlight = null;

  const load = async (url) => {
    const at = now();
    let text;
    try {
      text = await fetchText(url);
    } catch (err) {
      if (err instanceof CalendarError) throw err;
      throw new CalendarError("Can't reach the calendar");
    }
    return parseEvents(text, { from: at - WINDOW_BEFORE_MS, to: at + WINDOW_AFTER_MS });
  };

  // Resolves to the events (without sortMs), throws CalendarError on failure.
  const getEvents = async (url, { fresh = false } = {}) => {
    if (!fresh && cache && cache.url === url && now() - cache.at < ttlMs) {
      if (cache.error) throw cache.error;
      return cache.value;
    }
    if (inFlight && inFlight.url === url) return inFlight.promise;

    const promise = load(url)
      .then((events) => {
        const value = events.map(({ sortMs, ...e }) => e);
        cache = { at: now(), url, value };
        return value;
      })
      .catch((error) => {
        cache = { at: now(), url, error };
        onError(error);
        throw error;
      })
      .finally(() => {
        if (inFlight && inFlight.promise === promise) inFlight = null;
      });
    inFlight = { url, promise };
    return promise;
  };

  return { getEvents };
};

const DEFAULT_COLOR = '#6ee2ff';

// Read the calendar list out of config. config.calendars holds the non-secret
// part of each entry ({ id, name, color }) and config.CALENDAR_SECRETS maps
// id -> iCal link (a separate top-level key so backups strip it). Entries
// without an id or a usable link are skipped. Pure.
const readCalendars = (config) => {
  const list = Array.isArray(config.calendars) ? config.calendars : [];
  const secrets =
    config.CALENDAR_SECRETS && typeof config.CALENDAR_SECRETS === 'object'
      ? config.CALENDAR_SECRETS
      : {};
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.slice(0, 64) : '';
    const url = normalizeFeedUrl(secrets[id]);
    if (!id || !url || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name:
        typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim().slice(0, 40)
          : 'Calendar',
      color:
        typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)
          ? entry.color.toLowerCase()
          : DEFAULT_COLOR,
      url,
    });
    if (out.length >= MAX_CALENDARS) break;
  }
  return out;
};

// All configured calendars, each with its own client (cache).
const createCalendarManager = ({
  getConfig = loadConfig,
  clientFactory = () => createCalendarClient(),
} = {}) => {
  const clients = new Map();

  // Resolves to { calendars, events }:
  // calendars: one entry per calendar, in settings order:
  //   { id, name, color, ok: true } or { id, name, color, ok: false, error }
  // events: every calendar's events merged, sorted by start, each tagged with
  //   its calendarId. Never rejects for a calendar failure.
  const getAll = async ({ fresh = false } = {}) => {
    const calendars = readCalendars(await getConfig());

    const ids = new Set(calendars.map((c) => c.id));
    for (const id of clients.keys()) {
      if (!ids.has(id)) clients.delete(id);
    }

    const results = await Promise.all(
      calendars.map(async ({ id, name, color, url }) => {
        if (!clients.has(id)) clients.set(id, clientFactory());
        try {
          const events = await clients.get(id).getEvents(url, { fresh });
          return { calendar: { id, name, color, ok: true }, events };
        } catch (err) {
          if (!(err instanceof CalendarError)) throw err;
          return { calendar: { id, name, color, ok: false, error: err.message }, events: [] };
        }
      })
    );

    const events = [];
    for (const { calendar, events: list } of results) {
      for (const e of list) events.push({ calendarId: calendar.id, ...e });
    }
    // Rough order only (dates count as UTC midnight, floating times as server
    // time); the browser re-sorts in its own time zone.
    events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return { calendars: results.map((r) => r.calendar), events };
  };

  return { getAll };
};

module.exports = {
  createCalendarClient,
  createCalendarManager,
  readCalendars,
  normalizeFeedUrl,
  parseEvents,
  fetchFeed,
  CalendarError,
  MAX_CALENDARS,
  CACHE_TTL_MS,
  calendars: createCalendarManager(),
};
