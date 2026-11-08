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

import { DateTime, Greeting } from './Clock';

interface Props {
  // Shared with the Upcoming section, so both use one request.
  calendar: CalendarState;
}

export const Header = ({ calendar }: Props): JSX.Element => {
  const {
    hideHeader,
    hideDate,
    showTime,
    calendarShowNext,
    WEATHER_API_KEY,
  } = useSelector(
    (state: State) => state.config.config
  );
  // Pi-hole and weather are only for logged-in users (the server enforces
  // this too). Not mounting them means guests don't even request the data. The
  // server sends the real key only to admins, so an empty key also means
  // weather is off: skip the request and the WebSocket.
  const isAuthenticated = useSelector(
    (state: State) => state.auth.isAuthenticated
  );

  return (
    <header className={classes.Header}>
      {(!hideDate || showTime) && <DateTime />}

      <Link to="/settings" className={classes.SettingsLink}>
        Go to Settings
      </Link>

      {!hideHeader && (
        <span className={classes.HeaderMain}>
          <span className={classes.HeaderGreeting}>
            <Greeting />
            {calendarShowNext && <CalendarNext calendar={calendar} />}
          </span>
          <span className={classes.HeaderWidgets}>
            {isAuthenticated && <PiholeWidget />}
            {isAuthenticated && !!WEATHER_API_KEY && <WeatherWidget />}
          </span>
        </span>
      )}
    </header>
  );
};
