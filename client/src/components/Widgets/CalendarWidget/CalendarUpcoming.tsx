import { CSSProperties } from 'react';
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';

import { SectionHeadline } from '../../UI';
import { CalendarState } from './useCalendar';
import { dayLabel, eventsForDay, startOfDay, timeLabel } from './calendarTime';

import classes from './CalendarWidget.module.css';

// Events for today and the next few days, one column per day, between the
// header and Applications.
export const CalendarUpcoming = ({ calendar }: { calendar: CalendarState }): JSX.Element | null => {
  const { calendarDays } = useSelector((state: State) => state.config.config);
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);
  const { data, events, now } = calendar;
  // Nothing configured for this viewer (or hidden from guests).
  if (!data || data.calendars.length === 0) return null;

  const days = Math.min(7, Math.max(1, Math.round(Number(calendarDays) || 4)));
  const today = startOfDay(now);
  const colors = new Map(data.calendars.map((c) => [c.id, c.color]));
  const failed = data.calendars.filter((c) => !c.ok);

  // Columns ramp up with the screen width like the bookmark grid (1, 2, 3, 4),
  // never more than there are days, and a wide screen shows every day.
  const style = {
    '--cal-cols-sm': Math.min(days, 2),
    '--cal-cols-md': Math.min(days, 3),
    '--cal-cols-lg': Math.min(days, 4),
    '--cal-cols-xl': days,
  } as CSSProperties;

  return (
    <div className={classes.Upcoming}>
      <SectionHeadline title="Upcoming" link="/settings/calendar" />
      <div className={classes.Days} style={style}>
        {Array.from({ length: days }, (_, i) => {
          const dayStart = startOfDay(now, i);
          const list = eventsForDay(events, dayStart, now);
          return (
            <div key={dayStart} className={classes.Day}>
              <h3 className={classes.DayName}>{dayLabel(dayStart, today)}</h3>
              {list.length === 0 ? (
                <p className={classes.Empty}>
                  {i === 0 ? 'Nothing else today' : 'Nothing planned'}
                </p>
              ) : (
                <ul className={classes.Events}>
                  {list.map((e) => (
                    <li
                      key={`${e.calendarId}|${e.start}|${e.title}`}
                      className={classes.Event}
                      title={e.title}
                    >
                      <span
                        className={classes.Dot}
                        style={{ backgroundColor: colors.get(e.calendarId) }}
                      />
                      <span className={classes.Time}>{timeLabel(e, dayStart)}</span>
                      <span className={classes.Title}>{e.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {isAuthenticated &&
        failed.map((c) => (
          <p key={c.id} className={classes.Failed} title={c.ok ? '' : c.error}>
            Couldn't load {c.name}: {c.ok ? '' : c.error}
          </p>
        ))}
    </div>
  );
};
