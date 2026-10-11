// One configured calendar (config.calendars). The iCal link lives in
// CALENDAR_SECRETS and is never sent to guests.
export interface CalendarInstance {
  id: string;
  name: string;
  // #rrggbb, the dot shown next to each of its events.
  color: string;
}

// One event from GET /api/calendar.
export interface CalendarEvent {
  calendarId: string;
  title: string;
  // All-day: "YYYY-MM-DD" (end exclusive). Timed: an ISO instant, or
  // "YYYY-MM-DDTHH:MM:SS" without a zone, meaning the viewer's local time.
  start: string;
  end: string;
  allDay: boolean;
}

export type CalendarStatus =
  | (CalendarInstance & { ok: true })
  | (CalendarInstance & { ok: false; error: string });

export interface CalendarData {
  calendars: CalendarStatus[];
  events: CalendarEvent[];
}
