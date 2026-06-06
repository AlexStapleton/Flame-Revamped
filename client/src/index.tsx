import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store/store';

// Side-effect import: registers the handler that inlines <svg data-src="...">
// elements (used by AppCard/BookmarkCard for SVG icons referenced by URL or
// uploaded as .svg). Without it those icons render as empty <svg> tags.
import 'external-svg-loader';

// CSS
import './index.css';

// Components
import { App } from './App';

const container = document.getElementById('root');
const root = createRoot(container!); // new for React 18 API

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
