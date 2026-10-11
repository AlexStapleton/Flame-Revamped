import { Icon as MDIcon } from '@mdi/react';
import { mdiCalendarBlankOutline } from '@mdi/js';

import { CalendarState } from './useCalendar';
import { nextEvent, nextLabel } from './calendarTime';

import classes from './CalendarWidget.module.css';

// One line under the greeting: the next event, e.g. "10:30 Dentist · in 2h
// 15m". Unlike the weather and Pi-hole widgets it stays on narrow screens,
// since it is short.
export const CalendarNext = ({ calendar }: { calendar: CalendarState }): JSX.Element | null => {
  const { data, events, now } = calendar;
  if (!data) return null;
  const event = nextEvent(events, now);
  if (!event) return null;

  const { when, note } = nextLabel(event, now);
  const color = data.calendars.find((c) => c.id === event.calendarId)?.color;
  const name = data.calendars.find((c) => c.id === event.calendarId)?.name;

  return (
    <div className={classes.Next} title={name ? `${name}: ${event.title}` : event.title}>
      <MDIcon
        className={classes.NextIcon}
        path={mdiCalendarBlankOutline}
        color={color || 'var(--color-primary)'}
      />
      <span className={classes.NextWhen}>{when}</span>
      <span className={classes.NextTitle}>{event.title}</span>
      {note && <span className={classes.NextNote}>· {note}</span>}
    </div>
  );
};
