import { useState, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { State } from '../../store/reducers';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../store';

// Typescript
import { App, Category } from '../../interfaces';

// UI
import { Icon, Container, SectionHeadline, Spinner, Message } from '../UI';

// CSS
import classes from './Home.module.css';

// Components
import { AppGrid } from '../Apps/AppGrid/AppGrid';
import { BookmarkGrid } from '../Bookmarks/BookmarkGrid/BookmarkGrid';
import { SearchBar } from '../SearchBar/SearchBar';
import { Header } from './Header/Header';

// Utils
import { escapeRegex } from '../../utility';

export const Home = (): JSX.Element => {
  const {
    apps: { apps, loading: appsLoading },
    bookmarks: { categories, loading: bookmarksLoading },
    config: { config },
    auth: { isAuthenticated },
  } = useSelector((state: State) => state);

  const dispatch = useDispatch();
  const { getApps, getCategories } = bindActionCreators(
    actionCreators,
    dispatch
  );

  // Local search query
  const [localSearch, setLocalSearch] = useState<null | string>(null);
  const [appSearchResult, setAppSearchResult] = useState<null | App[]>(null);
  const [bookmarkSearchResult, setBookmarkSearchResult] = useState<
    null | Category[]
  >(null);

  // Load applications
  useEffect(() => {
    if (!apps.length) {
      getApps();
    }
  }, []);

  // While logged in, refresh apps periodically so health-status dots stay current.
  // Skip ticks while the tab is hidden (nobody's looking at the dots) and instead
  // refresh once when the tab regains focus — this avoids a steady background
  // full-list fetch + grid re-render on tabs left open in the background.
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') getApps();
    };

    const id = window.setInterval(refreshIfVisible, 60000);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [isAuthenticated]);

  // Load bookmark categories
  useEffect(() => {
    if (!categories.length) {
      getCategories();
    }
  }, []);

  useEffect(() => {
    if (localSearch) {
      // Compile the query once and reuse it across every app/bookmark instead of
      // rebuilding the same RegExp inside each filter callback (per item, per
      // keystroke). No 'g' flag, so reusing the instance with .test() is safe.
      const searchRegex = new RegExp(escapeRegex(localSearch), 'i');

      // Search through apps
      setAppSearchResult([
        ...apps.filter(({ name, description }) =>
          searchRegex.test(`${name} ${description}`)
        ),
      ]);

      // Search through bookmarks
      const category = { ...categories[0] };

      category.name = 'Search Results';
      category.bookmarks = categories
        .map(({ bookmarks }) => bookmarks)
        .flat()
        .filter(({ name }) => searchRegex.test(name));

      setBookmarkSearchResult([category]);
    } else {
      setAppSearchResult(null);
      setBookmarkSearchResult(null);
    }
  }, [localSearch]);

  return (
    <Container>
      {!config.hideSearch ? (
        <SearchBar
          setLocalSearch={setLocalSearch}
          appSearchResult={appSearchResult}
          bookmarkSearchResult={bookmarkSearchResult}
        />
      ) : (
        <div></div>
      )}

      <Header />

      {!isAuthenticated &&
      !apps.some((a) => a.isPinned) &&
      !categories.some((c) => c.isPinned) ? (
        <Message>
          Welcome to Flame! Go to <Link to="/settings/app">/settings</Link>,
          login and start customizing your new homepage
        </Message>
      ) : (
        <></>
      )}

      {!config.hideApps && (isAuthenticated || apps.some((a) => a.isPinned)) ? (
        <Fragment>
          <SectionHeadline title="Applications" link="/applications" />
          {appsLoading ? (
            <Spinner />
          ) : (
            <AppGrid
              apps={
                !appSearchResult
                  ? apps.filter(({ isPinned }) => isPinned)
                  : appSearchResult
              }
              totalApps={apps.length}
              searching={!!localSearch}
              sortable={
                isAuthenticated &&
                config.useOrdering === 'orderId' &&
                !localSearch
              }
            />
          )}
          <div className={classes.HomeSpace}></div>
        </Fragment>
      ) : (
        <></>
      )}

      {!config.hideCategories &&
      (isAuthenticated || categories.some((c) => c.isPinned)) ? (
        <Fragment>
          <SectionHeadline title="Bookmarks" link="/bookmarks" />
          {bookmarksLoading ? (
            <Spinner />
          ) : (
            <BookmarkGrid
              categories={
                !bookmarkSearchResult
                  ? categories.filter(
                      ({ isPinned, bookmarks }) => isPinned && bookmarks.length
                    )
                  : bookmarkSearchResult
              }
              totalCategories={categories.length}
              searching={!!localSearch}
              fromHomepage={true}
              sortable={
                isAuthenticated &&
                config.useOrdering === 'orderId' &&
                !localSearch
              }
            />
          )}
        </Fragment>
      ) : (
        <></>
      )}

      <Link to="/settings" className={classes.SettingsButton}>
        <Icon icon="mdiCog" color="var(--color-background)" />
      </Link>
    </Container>
  );
};
