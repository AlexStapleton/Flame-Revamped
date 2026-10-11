import { CalendarEvent } from '../../../interfaces';

// Pure date helpers for the calendar widget. Everything here works in the
// browser's own time zone: the server sends instants (or plain dates for
// all-day events) and the viewer decides what "today" means.

export interface TimedEvent extends CalendarEvent {
  startMs: number;
  endMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" -> local midnight of that date.
const parseLocalDate = (value: string): number => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

// ISO instants parse as such; "YYYY-MM-DDTHH:MM:SS" (no zone) parses as local
// time, which is what a floating iCal time means.
export const toTimed = (e: CalendarEvent): TimedEvent | null => {
  const startMs = e.allDay ? parseLocalDate(e.start) : Date.parse(e.start);
  const rawEnd = e.allDay ? parseLocalDate(e.end) : Date.parse(e.end);
  if (!Number.isFinite(startMs)) return null;
  const endMs = Number.isFinite(rawEnd) && rawEnd > startMs ? rawEnd : startMs;
  return { ...e, startMs, endMs };
};

// Local midnight `offset` days after the day containing `ms`.
export const startOfDay = (ms: number, offset = 0): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
};

// Over, from the viewer's point of view. An event without an end counts as
// over once it has started.
const isOver = (e: TimedEvent, now: number): boolean =>
  e.endMs > e.startMs ? e.endMs <= now : e.startMs < now;

const byStart = (a: TimedEvent, b: TimedEvent): number =>
  a.startMs - b.startMs || a.title.localeCompare(b.title);

// Events to list under one day: anything overlapping [dayStart, dayEnd) that
// isn't over yet. All-day events first, then by start time.
export const eventsForDay = (
  events: TimedEvent[],
  dayStart: number,
  now: number
): TimedEvent[] => {
  const dayEnd = startOfDay(dayStart, 1);
  return events
    .filter((e) => {
      if (isOver(e, now)) return false;
      if (e.endMs > e.startMs) return e.startMs < dayEnd && e.endMs > dayStart;
      return e.startMs >= dayStart && e.startMs < dayEnd;
    })
    .sort((a, b) => {
      const allA = coversDay(a, dayStart) ? 0 : 1;
      const allB = coversDay(b, dayStart) ? 0 : 1;
      return allA - allB || byStart(a, b);
    });
};

const coversDay = (e: TimedEvent, dayStart: number): boolean =>
  e.allDay || (e.startMs <= dayStart && e.endMs >= startOfDay(dayStart, 1));

export const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const weekday = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });

// What goes in the time column of the Upcoming section for one day.
export const timeLabel = (e: TimedEvent, dayStart: number): string => {
  if (coversDay(e, dayStart)) return 'All day';
  if (e.startMs >= dayStart) return formatTime(e.startMs);
  return `until ${formatTime(e.endMs)}`;
};

// Column heading: Today, Tomorrow, then e.g. "Tue, 13 Oct" in the viewer's
// locale.
export const dayLabel = (dayStart: number, today: number): string => {
  const offset = Math.round((dayStart - today) / DAY_MS);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// The one event the header line shows:
// 1. the next timed event that isn't over, if it is today;
// 2. otherwise an all-day event happening today;
// 3. otherwise whichever comes first later on.
export const nextEvent = (events: TimedEvent[], now: number): TimedEvent | null => {
  const tomorrow = startOfDay(now, 1);
  const upcoming = events.filter((e) => !isOver(e, now)).sort(byStart);
  const timed = upcoming.filter((e) => !e.allDay);
  if (timed.length && timed[0].startMs < tomorrow) return timed[0];
  const allDayToday = upcoming.find((e) => e.allDay && e.startMs <= now);
  if (allDayToday) return allDayToday;
  return upcoming[0] || null;
};

// "5 min", "2h 15m", "3h".
export const formatDuration = (ms: number): string => {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// The header line, split into the highlighted "when" and a muted note.
export const nextLabel = (
  e: TimedEvent,
  now: number
): { when: string; note: string } => {
  const today = startOfDay(now);
  const dayOffset = Math.round((startOfDay(e.startMs) - today) / DAY_MS);
  const dayName =
    dayOffset <= 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : weekday(e.startMs);

  if (e.allDay) {
    // Multi-day all-day events say how long they last.
    const days = Math.round((e.endMs - e.startMs) / DAY_MS);
    const note =
      days > 1 && e.startMs <= now
        ? `until ${dayLabel(startOfDay(e.endMs, -1), today)}`
        : '';
    return { when: dayName, note };
  }
  if (e.startMs <= now) {
    if (e.endMs <= now) return { when: 'Now', note: '' };
    const endsToday = e.endMs <= startOfDay(now, 1);
    return {
      when: 'Now',
      note: `until ${endsToday ? '' : `${weekday(e.endMs)} `}${formatTime(e.endMs)}`,
    };
  }
  if (dayOffset === 0) {
    return { when: formatTime(e.startMs), note: `in ${formatDuration(e.startMs - now)}` };
  }
  return { when: `${dayName} ${formatTime(e.startMs)}`, note: '' };
};
