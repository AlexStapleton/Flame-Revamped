import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Redux
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';

// CSS
import classes from './Header.module.css';

// Components
import { WeatherWidget } from '../../Widgets/WeatherWidget/WeatherWidget';
import { PiholeWidget } from '../../Widgets/PiholeWidget/PiholeWidget';
import { CalendarNext } from '../../Widgets/CalendarWidget/CalendarNext';
import { CalendarState } from '../../Widgets/CalendarWidget/useCalendar';

// Utils
import { getDateTime } from './functions/getDateTime';
import { greeter } from './functions/greeter';

interface Props {
  // Shared with the Upcoming section, so both use one request.
  calendar: CalendarState;
}

export const Header = ({ calendar }: Props): JSX.Element => {
  const { hideHeader, hideDate, showTime, calendarShowNext } = useSelector(
    (state: State) => state.config.config
  );

  const [dateTime, setDateTime] = useState<string>(getDateTime());
  const [greeting, setGreeting] = useState<string>(greeter());

  useEffect(() => {
    let dateTimeInterval: ReturnType<typeof setInterval>;

    dateTimeInterval = setInterval(() => {
      setDateTime(getDateTime());
      setGreeting(greeter());
    }, 1000);

    return () => window.clearInterval(dateTimeInterval);
  }, []);

  return (
    <header className={classes.Header}>
      {(!hideDate || showTime) && <p>{dateTime}</p>}

      <Link to="/settings" className={classes.SettingsLink}>
        Go to Settings
      </Link>

      {!hideHeader && (
        <span className={classes.HeaderMain}>
          <span className={classes.HeaderGreeting}>
            <h1>{greeting}</h1>
            {calendarShowNext && <CalendarNext calendar={calendar} />}
          </span>
          <span className={classes.HeaderWidgets}>
            <PiholeWidget />
            <WeatherWidget />
          </span>
        </span>
      )}
    </header>
  );
};
