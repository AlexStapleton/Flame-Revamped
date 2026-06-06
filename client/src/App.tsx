import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { autoLogin, getConfig } from './store/action-creators';
import { actionCreators, store } from './store';
import { State } from './store/reducers';

// Utils
import { checkVersion, decodeToken, parsePABToTheme } from './utility';

// Routes — Home is the landing page so it stays eager; the heavier admin
// routes are code-split so the homepage doesn't pay for them on first load.
import { Home } from './components/Home/Home';
import { NotificationCenter } from './components/NotificationCenter/NotificationCenter';
import { Spinner } from './components/UI/Spinner/Spinner';

const Apps = lazy(() =>
  import('./components/Apps/Apps').then((m) => ({ default: m.Apps }))
);
const Settings = lazy(() =>
  import('./components/Settings/Settings').then((m) => ({ default: m.Settings }))
);
const Bookmarks = lazy(() =>
  import('./components/Bookmarks/Bookmarks').then((m) => ({ default: m.Bookmarks }))
);

// routing
import { ProtectedRoute } from './components/Routing/ProtectedRoute';

// Get config
store.dispatch<any>(getConfig());

// Validate token
if (localStorage.token) {
  store.dispatch<any>(autoLogin());
}

export const App = (): JSX.Element => {
  const { config, loading } = useSelector((state: State) => state.config);
  const dispatch = useDispatch();
  const { fetchQueries, setTheme, logout, createNotification, fetchThemes } =
    bindActionCreators(actionCreators, dispatch);

  useEffect(() => {
    const id = window.setInterval(() => {
      const token = localStorage.getItem('token');
      if (!token) return;
  
      try {
        const { exp } = decodeToken(token) as { exp?: number };
        if (exp && Date.now() > exp * 1000) {
          // clear token+logout
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');

          logout();
          createNotification({
            title: 'Info',
            message: 'Session expired. You have been logged out',
          });
  
          window.clearInterval(id);
        }
      } catch {
        localStorage.removeItem('token');
        logout();
        window.clearInterval(id);
      }
    }, 30000);
  
    fetchThemes();
    if (localStorage.theme) setTheme(parsePABToTheme(localStorage.theme));
    fetchQueries();
  
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (config.automaticUpdates && (config.showPopups ?? true)) {
      const useDefaults = config.useDefaults ?? true;
      const defaultUpdateUrl = undefined;
      const urlToUse = useDefaults ? defaultUpdateUrl : (config.updateUrl || undefined);
      void checkVersion(false, urlToUse, true); // settings => about => version => popups enabled
    }
  }, [config.automaticUpdates, config.showPopups, config.useDefaults, config.updateUrl]);
  
  // If there is no user theme, set the default one
  useEffect(() => {
    if (!loading && !localStorage.theme) {
      setTheme(parsePABToTheme(config.defaultTheme), false);
    }
  }, [loading, config.defaultTheme]);

  // Push the configured dashboard width to the --dashboard-width CSS variable
  // (read by Layout's .Container). Clamp to 30-100 so a transient empty/invalid
  // value while typing in Settings can't collapse the layout.
  useEffect(() => {
    const raw = Number(config.dashboardWidth);
    const pct = Number.isFinite(raw) ? Math.min(100, Math.max(30, raw)) : 75;
    document.body.style.setProperty('--dashboard-width', `${pct}%`);
  }, [config.dashboardWidth]);

  return (
    <>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            {/* Public route */}
            <Route path="/" element={<Home />} />

            {/* Protected Routes */}
            <Route
              path="/applications"
              element={
                <ProtectedRoute>
                  <Apps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookmarks"
              element={
                <ProtectedRoute>
                  <Bookmarks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/*"
              element={
                  <Settings />
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <NotificationCenter />
    </>
  );
};
