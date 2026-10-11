import { NavLink, Link, Routes, Route } from 'react-router-dom';

// Redux
import { useSelector } from 'react-redux';
import { State } from '../../store/reducers';

// CSS
import classes from './Settings.module.css';

// Components
import { Container } from '../UI';
import { GeneralSettings } from './GeneralSettings/GeneralSettings';
import { UISettings } from './UISettings/UISettings';
import { WeatherSettings } from './WeatherSettings/WeatherSettings';
import { PiholeSettings } from './PiholeSettings/PiholeSettings';
import { CalendarSettings } from './CalendarSettings/CalendarSettings';
import { DockerSettings } from './DockerSettings/DockerSettings';
import { Themer } from './Themer/Themer';
import { AppDetails } from './AppDetails/AppDetails';
import { AuthForm } from './AppDetails/AuthForm/AuthForm';
import { StyleSettings } from './StyleSettings/StyleSettings';

// React Router 6+ dropped NavLink's activeClassName; className takes a
// function of the link state instead.
const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  isActive
    ? `${classes.SettingsNavLink} ${classes.SettingsNavLinkActive}`
    : classes.SettingsNavLink;

export const Settings = (): JSX.Element => {
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);

  return (
    <Container>
      {!isAuthenticated ? (
        <AuthForm />
      ) : (
        <div className={classes.Settings}>
          <div className={classes.SettingsNav}>
            <h2 className={classes.SettingsNavTitle}>Settings</h2>
            <NavLink
              to="/settings/app"
              className={navLinkClass}
            >
              General
            </NavLink>
            <NavLink
              to="/settings/ui"
              className={navLinkClass}
            >
              Interface
            </NavLink>
            <NavLink
              to="/settings/weather"
              className={navLinkClass}
            >
              Weather
            </NavLink>
            <NavLink
              to="/settings/pihole"
              className={navLinkClass}
            >
              Pi-hole
            </NavLink>
            <NavLink
              to="/settings/calendar"
              className={navLinkClass}
            >
              Calendar
            </NavLink>
            <NavLink
              to="/settings/docker"
              className={navLinkClass}
            >
              Docker
            </NavLink>
            <NavLink
              to="/settings/theme"
              className={navLinkClass}
            >
              Theme
            </NavLink>
            <NavLink
              to="/settings/css"
              className={navLinkClass}
            >
              CSS
            </NavLink>
            <NavLink
              to="/settings/details"
              className={navLinkClass}
            >
              About
            </NavLink>
            <Link to="/" className={classes.GoBack}>
              Go back
            </Link>
          </div>
          <div className={classes.SettingsContent}>
            <Routes>
              <Route path="/app" element={<GeneralSettings />} />
              <Route path="/ui" element={<UISettings />} />
              <Route path="/weather" element={<WeatherSettings />} />
              <Route path="/pihole" element={<PiholeSettings />} />
              <Route path="/calendar" element={<CalendarSettings />} />
              <Route path="/docker" element={<DockerSettings />} />
              <Route path="/theme" element={<Themer />} />
	      <Route path="/css" element={<StyleSettings />} />
              <Route path="/details" element={<AppDetails />} />
            </Routes>
          </div>
        </div>
      )}
    </Container>
  );
};
