import { useState, useEffect, FormEvent } from 'react';
import { http } from '../../../utility/http';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import {
  ApiResponse,
  CalendarData,
  CalendarForm,
  CalendarInstance,
} from '../../../interfaces';

// UI
import { InputGroup, Button, SettingsHeadline } from '../../UI';

// Utils
import { applyAuth, calendarSettingsTemplate } from '../../../utility';

// CSS
import classes from './CalendarSettings.module.css';

// Same limit as the server (utils/calendar.js MAX_CALENDARS).
const MAX_CALENDARS = 10;

// New calendars take the next of these, so dots are told apart by default.
const PALETTE = ['#6ee2ff', '#ffb86e', '#a3e36e', '#ff6e9c', '#c49bff', '#ffe36e'];

// crypto.randomUUID needs a secure context, and Flame is often served over
// plain http on a LAN, so build a short random id instead.
const newId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const LINK_PATTERN = /^(https?|webcals?):\/\/\S+$/i;

export const CalendarSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification, updateConfig } = bindActionCreators(
    actionCreators,
    dispatch
  );

  const [formData, setFormData] = useState<CalendarForm>(calendarSettingsTemplate);

  // Get config
  useEffect(() => {
    setFormData({
      calendars: (config.calendars || []).map((c) => ({ ...c })),
      CALENDAR_SECRETS: { ...(config.CALENDAR_SECRETS || {}) },
      calendarShowNext: config.calendarShowNext ?? true,
      calendarShowUpcoming: config.calendarShowUpcoming ?? true,
      calendarDays: config.calendarDays ?? 4,
      calendarHideFromGuests: config.calendarHideFromGuests ?? false,
    });
  }, [loading]);

  const updateCalendar = (id: string, changes: Partial<CalendarInstance>) => {
    setFormData((prev) => ({
      ...prev,
      calendars: prev.calendars.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    }));
  };

  const updateLink = (id: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      CALENDAR_SECRETS: { ...prev.CALENDAR_SECRETS, [id]: value },
    }));
  };

  const addCalendar = () => {
    setFormData((prev) => {
      const used = new Set(prev.calendars.map((c) => c.color));
      const color =
        PALETTE.find((p) => !used.has(p)) ||
        PALETTE[prev.calendars.length % PALETTE.length];
      return {
        ...prev,
        calendars: [...prev.calendars, { id: newId(), name: '', color }],
      };
    });
  };

  const removeCalendar = (id: string) => {
    setFormData((prev) => {
      const secrets = { ...prev.CALENDAR_SECRETS };
      delete secrets[id];
      return {
        ...prev,
        calendars: prev.calendars.filter((c) => c.id !== id),
        CALENDAR_SECRETS: secrets,
      };
    });
  };

  const setOption = <K extends keyof CalendarForm>(key: K, value: CalendarForm[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    const calendars = formData.calendars.map((c) => ({
      ...c,
      name: c.name.trim(),
    }));

    // Only keep links for calendars that still exist.
    const CALENDAR_SECRETS: Record<string, string> = {};
    for (const c of calendars) {
      const link = (formData.CALENDAR_SECRETS[c.id] || '').trim();
      if (!LINK_PATTERN.test(link)) {
        createNotification({
          title: 'Error',
          message: `iCal link of ${c.name || 'a calendar'} must start with https://, http:// or webcal://`,
        });
        return;
      }
      CALENDAR_SECRETS[c.id] = link;
    }

    // Save settings
    await updateConfig({
      calendars,
      CALENDAR_SECRETS,
      calendarShowNext: formData.calendarShowNext,
      calendarShowUpcoming: formData.calendarShowUpcoming,
      calendarDays: formData.calendarDays,
      calendarHideFromGuests: formData.calendarHideFromGuests,
    });

    if (calendars.length === 0) return;

    // Load every calendar right away so a wrong link shows up here instead of
    // as an empty section on the homescreen.
    http
      .get<ApiResponse<CalendarData>>('/api/calendar/update', {
        headers: applyAuth(),
      })
      .then((res) => {
        const results = res.data.data?.calendars || [];
        const failed = results.filter((r) => !r.ok);
        if (failed.length === 0) {
          const count = res.data.data?.events.length || 0;
          createNotification({
            title: 'Success',
            message: `Loaded ${results.length === 1 ? 'the calendar' : `all ${results.length} calendars`} (${count} event${count === 1 ? '' : 's'} in the next week)`,
          });
        }
        for (const r of failed) {
          createNotification({
            title: 'Error',
            message: `${r.name}: ${r.ok ? '' : r.error}`,
          });
        }
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response?.data?.error || 'Could not load the calendars',
        });
      });
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      {formData.calendars.length === 0 && (
        <>
          <SettingsHeadline text="Calendar" />
          <p>
            No calendars yet. Add one to show your next event in the header
            and the next few days above Applications.
          </p>
        </>
      )}

      {formData.calendars.map((c, i) => {
        const nameId = `calendar-name-${c.id}`;
        const colorId = `calendar-color-${c.id}`;
        const linkId = `calendar-link-${c.id}`;
        const label = c.name.trim() || `Calendar ${i + 1}`;

        return (
          <div key={c.id} className={classes.Entry}>
            <SettingsHeadline text={label} />

            <InputGroup>
              <label htmlFor={nameId}>Name</label>
              <input
                type="text"
                id={nameId}
                placeholder="Personal"
                maxLength={40}
                value={c.name}
                onChange={(e) => updateCalendar(c.id, { name: e.target.value })}
              />
            </InputGroup>

            <InputGroup>
              <label htmlFor={colorId}>Color</label>
              <input
                type="color"
                id={colorId}
                className={classes.Color}
                value={c.color}
                onChange={(e) => updateCalendar(c.id, { color: e.target.value })}
              />
              <span>The dot next to this calendar's events.</span>
            </InputGroup>

            <InputGroup>
              <label htmlFor={linkId}>Private iCal link</label>
              <input
                type="password"
                id={linkId}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                autoComplete="off"
                value={formData.CALENDAR_SECRETS[c.id] || ''}
                onChange={(e) => updateLink(c.id, e.target.value)}
              />
              <span>
                Google Calendar (on the web): Settings, pick the calendar,
                Integrate calendar, then copy "Secret address in iCal format".
                Outlook: Settings, Calendar, Shared calendars, Publish a
                calendar, then copy the ICS link. Nextcloud and iCloud
                subscription links work too. Anyone with this link can read
                the calendar, so it stays on the Flame server and is never sent
                to visitors.
              </span>
            </InputGroup>

            <Button type="button" click={() => removeCalendar(c.id)}>
              Remove {label}
            </Button>
          </div>
        );
      })}

      {formData.calendars.length > 0 && (
        <>
          <SettingsHeadline text="Display" />
          <InputGroup>
            <label htmlFor="calendarShowNext">Show next event in the header</label>
            <select
              id="calendarShowNext"
              value={formData.calendarShowNext ? 1 : 0}
              onChange={(e) => setOption('calendarShowNext', e.target.value === '1')}
            >
              <option value={1}>True</option>
              <option value={0}>False</option>
            </select>
            <span>One line under the greeting, like "10:30 Dentist · in 2h 15m".</span>
          </InputGroup>

          <InputGroup>
            <label htmlFor="calendarShowUpcoming">Show Upcoming section</label>
            <select
              id="calendarShowUpcoming"
              value={formData.calendarShowUpcoming ? 1 : 0}
              onChange={(e) => setOption('calendarShowUpcoming', e.target.value === '1')}
            >
              <option value={1}>True</option>
              <option value={0}>False</option>
            </select>
            <span>Events for the next few days, one column per day, above Applications.</span>
          </InputGroup>

          {formData.calendarShowUpcoming && (
            <InputGroup>
              <label htmlFor="calendarDays">Days in the Upcoming section</label>
              <select
                id="calendarDays"
                value={formData.calendarDays}
                onChange={(e) => setOption('calendarDays', Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Today only' : `${n} days`}
                  </option>
                ))}
              </select>
            </InputGroup>
          )}

          <InputGroup>
            <label htmlFor="calendarHideFromGuests">
              Visitors who aren't logged in
            </label>
            <select
              id="calendarHideFromGuests"
              value={formData.calendarHideFromGuests ? 1 : 0}
              onChange={(e) =>
                setOption('calendarHideFromGuests', e.target.value === '1')
              }
            >
              <option value={0}>See events</option>
              <option value={1}>See no events</option>
            </select>
            <span>
              Event titles are shown on the homescreen. Choose "See no events"
              if people you don't share your calendar with can open Flame.
            </span>
          </InputGroup>
        </>
      )}

      {formData.calendars.length < MAX_CALENDARS && (
        <Button type="button" click={addCalendar}>
          Add calendar
        </Button>
      )}

      <Button>Save changes</Button>
    </form>
  );
};
