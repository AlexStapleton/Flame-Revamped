import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';
import { ApiResponse, CalendarData } from '../../../interfaces';
import { http } from '../../../utility/http';
import { applyAuth } from '../../../utility';
import { TimedEvent, toTimed } from './calendarTime';

// The server caches each calendar for 5 minutes, so polling faster gains
// nothing.
const REFRESH_MS = 5 * 60 * 1000;
// How often "in 2h 15m" and "Today" are recomputed.
const TICK_MS = 30 * 1000;

export interface CalendarState {
  data: CalendarData | null;
  events: TimedEvent[];
  now: number;
}

// Fetches GET /api/calendar for the homescreen (the header line and the
// Upcoming section share one request). Polls only while the tab is visible
// and either part is switched on.
export const useCalendar = (): CalendarState => {
  const { loading, config } = useSelector((state: State) => state.config);
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);

  const enabled =
    !loading &&
    Array.isArray(config.calendars) &&
    config.calendars.length > 0 &&
    (config.calendarShowNext || config.calendarShowUpcoming);
  // Refetch when calendars are added, removed or renamed, and on login/logout
  // (guests may get nothing when calendarHideFromGuests is on).
  const listKey = enabled
    ? `${isAuthenticated}|` +
      config.calendars.map((c) => `${c.id}:${c.name}:${c.color}`).join('|')
    : '';

  const [data, setData] = useState<CalendarData | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    let cancelled = false;
    let poll: number | null = null;
    let tick: number | null = null;

    const load = () => {
      http
        .get<ApiResponse<CalendarData>>('/api/calendar', { headers: applyAuth() })
        .then((res) => {
          if (!cancelled) setData(res.data.data || null);
        })
        .catch(() => {
          // Flame itself is unreachable: keep the last events on screen.
        });
    };

    const start = () => {
      if (poll !== null) return;
      setNow(Date.now());
      load();
      poll = window.setInterval(load, REFRESH_MS);
      tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    };

    const stop = () => {
      if (poll !== null) window.clearInterval(poll);
      if (tick !== null) window.clearInterval(tick);
      poll = null;
      tick = null;
    };

    const onVisibilityChange = () =>
      document.visibilityState === 'visible' ? start() : stop();

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, listKey]);

  const events = useMemo(
    () =>
      (data?.events || [])
        .map(toTimed)
        .filter((e): e is TimedEvent => e !== null),
    [data]
  );

  return { data, events, now };
};
