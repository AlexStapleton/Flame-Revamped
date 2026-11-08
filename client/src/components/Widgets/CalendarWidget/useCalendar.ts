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

export interface CalendarState {
  data: CalendarData | null;
  events: TimedEvent[];
}

// Fetches GET /api/calendar for the homescreen (the header line and the
// Upcoming section share one request). The clock for "in 2h 15m" lives in
// the consumers (useNow), so a tick doesn't re-render Home. Polls only while the tab is visible
// and either part is switched on.
export const useCalendar = (): CalendarState => {
  const { loading, config } = useSelector((state: State) => state.config);
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);
  // True while a stored token is still being validated on page load.
  const checkingAuth = useSelector((state: State) => state.auth.checking);

  // Wait for the token check: fetching first as a guest and again once the
  // token is accepted would request the calendar twice on every admin load. A
  // real login/logout later still changes the key and refetches.
  const enabled =
    !loading &&
    !checkingAuth &&
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

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    let cancelled = false;
    let poll: number | null = null;

    // Skip a tick while a request is still running, and ignore an answer that
    // a newer request has overtaken.
    let inFlight = false;
    let seq = 0;

    const load = () => {
      if (inFlight) return;
      inFlight = true;
      const mine = ++seq;
      http
        .get<ApiResponse<CalendarData>>('/api/calendar', { headers: applyAuth() })
        .then((res) => {
          if (!cancelled && mine === seq) setData(res.data.data || null);
        })
        .catch(() => {
          // Flame itself is unreachable: keep the last events on screen.
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const start = () => {
      if (poll !== null) return;
      load();
      poll = window.setInterval(load, REFRESH_MS);
    };

    const stop = () => {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
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

  // Stable between fetches, so memoized consumers don't re-render with Home.
  return useMemo(() => ({ data, events }), [data, events]);
};
