// The full @mdi/js set is ~2.7MB. Icon names are user-chosen strings resolved at
// runtime, so it can't be tree-shaken, and shipping it to every visitor just to
// draw a handful of icons is wasteful. Instead the server returns only the
// paths we need: GET /api/apps and GET /api/categories carry the paths for
// their own icons (see primeIconCache), and anything else is fetched from
// GET /api/icons. Names requested close together are batched into one request
// (see batchScheduler), and results are kept in a module-level cache so later
// renders resolve synchronously (no flicker).

// Named imports are tree-shaken to single path strings. mdiCancel is the
// fallback for unknown names and failed requests. mdiCog is the homescreen's
// settings button, which renders before any data arrives; bundling it saves a
// request of its own on every first visit.
import { mdiCancel, mdiCog } from '@mdi/js';
import { createBatchScheduler } from './batchScheduler';

const cache = new Map<string, string>([
  ['mdiCancel', mdiCancel],
  ['mdiCog', mdiCog],
]);
// Names queued for the next batch, and names whose request hasn't settled yet.
// A component that mounts while its icon is in flight shares that request
// instead of sending a duplicate.
const waiting = new Map<string, (path: string) => void>();
const inflight = new Map<string, Promise<string>>();

// The server rejects requests with more than 300 names.
const MAX_NAMES_PER_REQUEST = 250;

const fetchChunk = async (
  names: string[],
  batch: Map<string, (path: string) => void>
): Promise<void> => {
  let found: Record<string, string> = {};
  let ok = false;
  try {
    const res = await fetch(`/api/icons?names=${encodeURIComponent(names.join(','))}`);
    if (res.ok) {
      const body = await res.json();
      found = (body && body.data) || {};
      ok = true;
    }
  } catch {
    // network failure: fall through to the fallback icon
  }

  for (const name of names) {
    const path = ok && typeof found[name] === 'string' ? found[name] : null;
    // Cache successes, and names the server confirmed don't exist. A failed
    // request is never cached, so a later render can retry.
    if (path) cache.set(name, path);
    else if (ok) cache.set(name, mdiCancel);
    batch.get(name)?.(path || mdiCancel);
  }
};

const flush = (): void => {
  const batch = new Map(waiting);
  waiting.clear();
  // Sorted so the same set of icons always produces the same URL, which lets
  // the browser's HTTP cache (Cache-Control: max-age=86400) serve repeat visits
  // regardless of which component mounted first.
  const names = [...batch.keys()].sort();

  for (let i = 0; i < names.length; i += MAX_NAMES_PER_REQUEST) {
    void fetchChunk(names.slice(i, i + MAX_NAMES_PER_REQUEST), batch);
  }
};

// The homescreen mounts icons over several ticks. A 0ms flush would send one
// request per tick. Waiting 20ms after the last request lets a page load share
// a single request, and the 100ms cap from the first request keeps a
// continuous stream from delaying it.
const scheduler = createBatchScheduler(flush, { debounceMs: 20, maxWaitMs: 100 });

export const getCachedIcon = (name: string): string | undefined => cache.get(name);

export const requestIcon = (name: string): Promise<string> => {
  const pending = inflight.get(name);
  if (pending) return pending;

  const promise = new Promise<string>((resolve) => {
    waiting.set(name, resolve);
    scheduler.schedule();
  });
  inflight.set(name, promise);
  void promise.then(() => inflight.delete(name));
  return promise;
};

// Seeds the cache with paths the server sent alongside list data, so cards
// rendered from that data draw their icons immediately.
export const primeIconCache = (icons: unknown): void => {
  if (!icons || typeof icons !== 'object') return;
  for (const [name, path] of Object.entries(icons as Record<string, unknown>)) {
    if (typeof path === 'string' && path.length > 0) cache.set(name, path);
  }
};
