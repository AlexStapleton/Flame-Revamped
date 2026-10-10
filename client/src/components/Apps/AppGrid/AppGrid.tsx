import { lazy, Suspense } from 'react';
import classes from './AppGrid.module.css';
import { Link } from 'react-router-dom';
import { App } from '../../../interfaces/App';

import { AppCard } from '../AppCard/AppCard';
import { Message } from '../../UI';

// Reordering (and therefore @dnd-kit) is only possible for authenticated users,
// so the sortable grid is split into its own lazy chunk. The plain grid is the
// Suspense fallback, so there is no layout shift while it loads.
const AppGridSortable = lazy(() =>
  import('./AppGridSortable').then((m) => ({ default: m.AppGridSortable }))
);

interface Props {
  apps: App[];
  totalApps?: number;
  searching: boolean;
  // When true (homescreen, authenticated, custom order), the pinned cards can
  // be drag-reordered. Other usages (/applications grid) leave this unset.
  sortable?: boolean;
}

export const AppGrid = (props: Props): JSX.Element => {
  // Empty states (unchanged from the presentational version).
  if (!(props.searching || props.apps.length)) {
    return props.totalApps ? (
      <Message>
        There are no pinned applications. You can pin them from the{' '}
        <Link to="/applications">/applications</Link> menu
      </Message>
    ) : (
      <Message>
        You don't have any applications. You can add a new one from{' '}
        <Link to="/applications">/applications</Link> menu
      </Message>
    );
  }

  if (!props.apps.length) {
    return <Message>No apps match your search criteria</Message>;
  }

  const grid = (
    <div className={classes.AppGrid}>
      {props.apps.map((app: App): JSX.Element => (
        <AppCard key={app.id} app={app} />
      ))}
    </div>
  );

  if (!props.sortable) return grid;

  return (
    <Suspense fallback={grid}>
      <AppGridSortable apps={props.apps} />
    </Suspense>
  );
};
