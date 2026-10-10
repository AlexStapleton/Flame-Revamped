import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom'; // updated for v6 pattern
import { State } from '../../store/reducers';

interface Props {
  children: JSX.Element;
}

export const ProtectedRoute = ({ children }: Props): JSX.Element => {
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);
  const checking = useSelector((state: State) => state.auth.checking);
  const location = useLocation();

  // A stored token is still being validated. Redirecting now would send a
  // logged-in admin who reloads /applications or /bookmarks to the homescreen.
  if (checking) return <></>;

  if (!isAuthenticated) {
    // not authenticated => homepage
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // If authenticated => render
  return children;
};
