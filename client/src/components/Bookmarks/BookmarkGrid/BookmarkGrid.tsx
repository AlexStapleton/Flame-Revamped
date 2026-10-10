import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

import classes from './BookmarkGrid.module.css';

import { Category } from '../../../interfaces';

import { BookmarkCard } from '../BookmarkCard/BookmarkCard';
import { Message } from '../../UI';
import { hasStoredToken } from '../../../utility';

// @dnd-kit only loads when reordering is possible (authenticated); the plain
// grid is the Suspense fallback so layout does not shift while it loads.
const loadBookmarkGridSortable = () => import('./BookmarkGridSortable');

// With a stored token, start the download now rather than after the token is
// validated (see AppGrid). Guests never download it.
if (hasStoredToken()) void loadBookmarkGridSortable().catch(() => {});

const BookmarkGridSortable = lazy(() =>
  loadBookmarkGridSortable().then((m) => ({
    default: m.BookmarkGridSortable,
  }))
);

interface Props {
  categories: Category[];
  totalCategories?: number;
  searching: boolean;
  fromHomepage?: boolean;
  // When true (homescreen, authenticated, custom order), the pinned category
  // cards can be drag-reordered. The /bookmarks grid leaves this unset.
  sortable?: boolean;
}

export const BookmarkGrid = (props: Props): JSX.Element => {
  const {
    categories,
    totalCategories,
    searching,
    fromHomepage = false,
    sortable = false,
  } = props;

  // Empty / no-match states (unchanged from the presentational version).
  if (!categories.length) {
    return totalCategories ? (
      <Message>
        There are no pinned categories. You can pin them from the{' '}
        <Link to="/bookmarks">/bookmarks</Link> menu
      </Message>
    ) : (
      <Message>
        You don't have any bookmarks. You can add a new one from{' '}
        <Link to="/bookmarks">/bookmarks</Link> menu
      </Message>
    );
  }

  if (searching && !categories[0].bookmarks.length) {
    return <Message>No bookmarks match your search criteria</Message>;
  }

  const grid = (
    <div className={classes.BookmarkGrid}>
      {categories.map((category: Category): JSX.Element => (
        <BookmarkCard
          category={category}
          fromHomepage={fromHomepage}
          key={category.id}
        />
      ))}
    </div>
  );

  if (!sortable) return grid;

  return (
    <Suspense fallback={grid}>
      <BookmarkGridSortable
        categories={categories}
        fromHomepage={fromHomepage}
      />
    </Suspense>
  );
};
