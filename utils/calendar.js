const crypto = require('crypto');
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
// hours), so a quarter of an hour is plenty and keeps big feeds cheap to serve.
// Failures are retried sooner.
const CACHE_TTL_MS = 15 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
// A download is expanded once over this horizon and kept in a compact form, so
// an unchanged feed (HTTP 304 or identical body) needs no re-parse while the
// visible window slides along.
const PARSE_HORIZON_MS = 21 * 24 * 60 * 60 * 1000;
const MAX_CACHED_EVENTS = 5000;
// Events are expanded from a day ago (the browser may be ahead of or behind
// the server, and "Today" starts at local midnight) to the furthest day the
// Upcoming section can show plus one.
const WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 9 * 24 * 60 * 60 * 1000;
// Guards against runaway rules (e.g. a minutely RRULE from 1990).
const MAX_ITERATIONS = 50000;
// Slack for comparing a raw UTC value with a zone-aware one (offsets < 1 day).
const SKEW_MARGIN_MS = 24 * 60 * 60 * 1000;
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

// GET the feed. With validators from an earlier download the request is
// conditional and an unchanged feed answers { notModified: true } without a
// body. Otherwise { text, etag, lastModified }. Messages never include the
// URL, because the URL is the secret.
const fetchFeedConditional = async (url, { etag, lastModified } = {}) => {
  const headers = { Accept: 'text/calendar, */*;q=0.5' };
  if (etag) headers['If-None-Match'] = etag;
  else if (lastModified) headers['If-Modified-Since'] = lastModified;
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers,
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
  if (res.status === 304 && (etag || lastModified)) {
    if (res.body) await res.body.cancel().catch(() => {});
    return { notModified: true };
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
  return {
    text: Buffer.concat(chunks).toString('utf8'),
    etag: res.headers.get('etag') || undefined,
    lastModified: res.headers.get('last-modified') || undefined,
  };
};

// GET the feed as text.
const fetchFeed = async (url) => (await fetchFeedConditional(url)).text;

// One formatter per zone: constructing an Intl.DateTimeFormat is slow (~50us)
// and used to happen once per recurrence occurrence. Zones are few, but the
// names come from feeds, so both caches are bounded. A null entry means "not
// an IANA zone".
const MAX_ZONE_CACHE = 100;
const zoneFormatters = new Map();

const zoneFormatter = (tz) => {
  if (zoneFormatters.has(tz)) return zoneFormatters.get(tz);
  let formatter = null;
  if (typeof tz === 'string' && tz) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      formatter = null;
    }
  }
  if (zoneFormatters.size >= MAX_ZONE_CACHE) zoneFormatters.clear();
  zoneFormatters.set(tz, formatter);
  return formatter;
};

// Offset of `timeZone` from UTC at the instant `ms`, in ms. Pure.
const tzOffsetMs = (ms, timeZone) => {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(ms));
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

const isIanaZone = (tz) => zoneFormatter(tz) !== null;

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
    endMs,
  };
};

// RRULE parts that only restrict a sub-daily series (RFC 5545 3.3.10 table)
// or expand it within each period; none of them depends on how many periods
// have passed since DTSTART.
const FF_PARTS = new Set(['BYMONTH', 'BYMONTHDAY', 'BYYEARDAY', 'BYDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND']);
const SUBDAILY_SECONDS = { SECONDLY: 1, MINUTELY: 60, HOURLY: 3600 };

// ical.js has no way to jump ahead, and a sub-daily series that started years
// ago would burn the whole iteration cap before reaching today. For a rule
// whose occurrences form a fixed lattice (no COUNT, no BYSETPOS, a single
// RRULE) iteration can instead start from DTSTART moved forward by a whole
// number of periods (k * INTERVAL * unit) of wall-clock time. ical.js steps
// such rules in the event's wall-clock fields (the zone only matters when an
// occurrence is turned into an instant), so the shifted start walks the same
// lattice, with the same limiters, as the original would at that point. That
// is checked against full iteration in the tests, including across DST.
// Returns the shifted DTSTART, or null to iterate from the real DTSTART.
// `beforeMs` is the instant before which no occurrence matters.
const fastForwardStart = (master, beforeMs) => {
  const rules = master.component.getAllProperties('rrule');
  if (rules.length !== 1) return null;
  const rule = rules[0].getFirstValue();
  const unit = rule && SUBDAILY_SECONDS[rule.freq];
  if (!unit || rule.count) return null;
  for (const [name, values] of Object.entries(rule.parts || {})) {
    if (!FF_PARTS.has(name)) return null;
    // "1MO"-style ordinals are not a plain limiter.
    if (name === 'BYDAY' && values.some((v) => !/^[A-Z]{2}$/.test(String(v)))) return null;
  }
  const start = master.startDate;
  if (!start || start.isDate) return null;

  // Overrides of old occurrences are found by iterating over their slot, so
  // never jump past one.
  let limitMs = beforeMs;
  for (const ex of Object.values(master.exceptions)) {
    const rid = ex.recurrenceId;
    if (!rid) return null;
    limitMs = Math.min(limitMs, rid.toUnixTime() * 1000 - SKEW_MARGIN_MS);
  }

  const step = (rule.interval || 1) * unit;
  const periods = Math.floor((limitMs / 1000 - start.toUnixTime()) / step);
  if (!Number.isFinite(periods) || periods < 1) return null;
  const shifted = start.clone();
  shifted.adjust(0, 0, 0, periods * step);
  return shifted;
};

// Parse an iCal feed and list the events (recurring ones expanded) that
// overlap [from, to) (epoch ms). Throws CalendarError on a feed that isn't
// iCal. Pure apart from registering the feed's VTIMEZONEs with ical.js.
const parseCalendar = (
  text,
  {
    from,
    to,
    // Called once with the UIDs of series that hit the iteration cap before
    // reaching the end of the window (their later events are missing).
    onTruncated = null,
    // Test hooks: raise the cap, or turn the fast-forward off to compare.
    maxIterations = MAX_ITERATIONS,
    fastForward = true,
  } = {}
) => {
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
      // `exceptions: []` stops ical.js rescanning every sibling VEVENT for
      // RECURRENCE-IDs on each construction (quadratic); we relate them below.
      event = new ICAL.Event(vevent, { exceptions: [] });
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

  const truncated = [];
  for (const master of masters.values()) {
    const seriesTz = master.startDate.timezone;
    let skipBefore = null;
    try {
      const durationMs = Math.max(0, master.duration.toSeconds() * 1000);
      if (Number.isFinite(durationMs)) skipBefore = from - durationMs - SKEW_MARGIN_MS;
    } catch {
      // No usable duration: do the full conversion for every occurrence.
    }
    let iterator;
    try {
      const start = fastForward && skipBefore !== null ? fastForwardStart(master, skipBefore) : null;
      iterator = start ? master.iterator(start) : master.iterator();
    } catch {
      continue;
    }
    // Occurrences come in start order, but a moved occurrence can land later
    // than its slot, so keep going a little past the window.
    const stopAt = to + 7 * 24 * 60 * 60 * 1000;
    const exceptionIds = Object.keys(master.exceptions);
    const hasRangeExceptions = master.rangeExceptions.length > 0;
    const isOverridden = (t) => {
      if (hasRangeExceptions) return true;
      if (!exceptionIds.length) return false;
      return (
        t.toString() in master.exceptions ||
        t.convertToZone(ICAL.Timezone.utcTimezone).toString() in master.exceptions
      );
    };
    let reachedEnd = false;
    for (let i = 0; i < maxIterations; i++) {
      let next;
      try {
        next = iterator.next();
      } catch {
        reachedEnd = true;
        break;
      }
      if (!next) {
        reachedEnd = true;
        break;
      }
      // Cheap pre-check for occurrences that clearly ended before the window:
      // the raw UTC value is off by at most a zone offset (< 1 day), so with a
      // day of margin plus the event's length nothing visible is skipped.
      // Occurrences with an override are never skipped (they may move).
      if (skipBefore !== null && next.toUnixTime() * 1000 < skipBefore && !isOverridden(next)) {
        continue;
      }
      if (convertTime(next, seriesTz).ms >= stopAt) {
        reachedEnd = true;
        break;
      }
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
    if (!reachedEnd) truncated.push(String(master.uid));
  }
  if (truncated.length && onTruncated) onTruncated(truncated);

  out.sort((a, b) => a.sortMs - b.sortMs || a.title.localeCompare(b.title));
  return out;
};

const parseEvents = (text, options = {}) =>
  parseCalendar(text, options).slice(0, options.limit ?? MAX_EVENTS_PER_CALENDAR);

// One log line per calendar refresh, never the feed URL (it is a secret).
const truncationMessage = (label, uids) => {
  const shown = uids.slice(0, 3).join(', ');
  const more = uids.length > 3 ? ` and ${uids.length - 3} more` : '';
  return `Calendar ${label}: recurring event(s) ${shown}${more} hit the ${MAX_ITERATIONS}-occurrence limit before the end of the parsed range; later occurrences are missing`;
};

// Feeds are parsed one at a time (downloads still overlap): parsing is
// synchronous, so several big feeds parsed back to back would stack up into
// one long stall. The event loop gets a turn between two parses.
let parseChain = Promise.resolve();
const parseExclusive = (task) => {
  const run = parseChain.then(() => new Promise((r) => setImmediate(r))).then(task);
  parseChain = run.catch(() => {});
  return run;
};

const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

// What the browser gets for the window around `at`, from a compact parsed
// copy, or null when that copy does not cover the window (so it has to be
// rebuilt from a fresh download). Pure.
const windowEvents = (parsed, at) => {
  const from = at - WINDOW_BEFORE_MS;
  const to = at + WINDOW_AFTER_MS;
  if (!parsed || from < parsed.from) return null;
  const list = parsed.events.filter((e) => e.endMs > from && e.sortMs < to);
  if (parsed.to < to && list.length < MAX_EVENTS_PER_CALENDAR) return null;
  return list.slice(0, MAX_EVENTS_PER_CALENDAR).map(({ sortMs, endMs, ...e }) => e);
};

// Client for ONE calendar. Many open dashboards cost one download per TTL, and
// a feed that has not changed (HTTP 304, or the same bytes) costs no parsing:
// the previous parse is kept as a compact event list covering the next 21
// days and the visible window is cut from it per request. Memory per calendar
// is that list (at most MAX_CACHED_EVENTS small objects), never the feed text.
const createCalendarClient = ({
  fetchText = fetchFeedConditional,
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  errorTtlMs = ERROR_TTL_MS,
  onError = (err) => logger.log(`Calendar: ${err.message}`, 'WARN'),
  onWarn = (message) => logger.log(message, 'WARN'),
} = {}) => {
  let cache = null; // { at, url } or { at, url, error }: when to ask the host again
  let parsed = null; // { url, from, to, events, hash, etag, lastModified }
  let inFlight = null;

  const download = async (url, validators) => {
    let res;
    try {
      res = await fetchText(url, validators);
    } catch (err) {
      if (err instanceof CalendarError) throw err;
      throw new CalendarError("Can't reach the calendar");
    }
    // A plain string (no validators) is accepted too.
    return typeof res === 'string' ? { text: res } : res;
  };

  const load = async (url, label) => {
    const previous = parsed && parsed.url === url ? parsed : null;
    let res = await download(
      url,
      previous ? { etag: previous.etag, lastModified: previous.lastModified } : {}
    );
    if (res.notModified) {
      if (previous) {
        const value = windowEvents(previous, now());
        if (value) return value;
      }
      // The kept copy no longer covers the window (or never existed): the
      // body is needed after all.
      res = await download(url, {});
    }
    const hash = sha1(res.text);
    if (previous && previous.hash === hash) {
      previous.etag = res.etag;
      previous.lastModified = res.lastModified;
      const value = windowEvents(previous, now());
      if (value) return value;
    }
    const at = now();
    const from = at - WINDOW_BEFORE_MS;
    let to = at + PARSE_HORIZON_MS;
    let events = await parseExclusive(() =>
      parseCalendar(res.text, {
        from,
        to,
        onTruncated: (uids) => onWarn(truncationMessage(label, uids)),
      })
    );
    if (events.length > MAX_CACHED_EVENTS) {
      // Only what comes before the cut is certain to be complete.
      to = events[MAX_CACHED_EVENTS - 1].sortMs;
      events = events.filter((e) => e.sortMs < to);
    }
    parsed = { url, from, to, events, hash, etag: res.etag, lastModified: res.lastModified };
    return windowEvents(parsed, at);
  };

  // Resolves to the events (without sortMs), throws CalendarError on failure.
  // `fresh` skips the TTL (the host is still asked with validators). `label`
  // names the calendar in log lines.
  const getEvents = async (url, { fresh = false, label = 'calendar' } = {}) => {
    if (!fresh && cache && cache.url === url) {
      const age = now() - cache.at;
      if (cache.error) {
        if (age < errorTtlMs) throw cache.error;
      } else if (age < ttlMs) {
        const value = windowEvents(parsed && parsed.url === url ? parsed : null, now());
        if (value) return value;
      }
    }
    if (inFlight && inFlight.url === url) return inFlight.promise;

    const promise = load(url, label)
      .then((value) => {
        cache = { at: now(), url };
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
          const events = await clients.get(id).getEvents(url, { fresh, label: `${id} (${name})` });
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
  fetchFeedConditional,
  CalendarError,
  MAX_CALENDARS,
  CACHE_TTL_MS,
  calendars: createCalendarManager(),
};
