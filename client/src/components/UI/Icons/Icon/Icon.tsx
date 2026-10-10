import { useEffect, useState } from 'react';
import classes from './Icon.module.css';

import { Icon as MDIcon } from '@mdi/react';
// A named import is tree-shaken to this single path string. It is the fallback
// for unknown icon names and for failed requests, so it is always available.
import { mdiCancel } from '@mdi/js';

interface Props {
  icon: string;
  color?: string;
}

// The full @mdi/js set is ~2.7MB. Icon names are user-chosen strings resolved at
// runtime, so it can't be tree-shaken, and shipping it to every visitor just to
// draw a handful of icons is wasteful. Instead the server (GET /api/icons)
// returns only the paths we ask for. Names requested in the same tick are
// batched into one request, and results are kept in a module-level cache so
// later renders resolve synchronously (no flicker).
const cache = new Map<string, string>([['mdiCancel', mdiCancel]]);
const waiting = new Map<string, Array<(path: string) => void>>();
let flushScheduled = false;

// The server rejects requests with more than 300 names.
const MAX_NAMES_PER_REQUEST = 250;

const fetchChunk = async (
  names: string[],
  batch: Map<string, Array<(path: string) => void>>
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
    (batch.get(name) || []).forEach((resolve) => resolve(path || mdiCancel));
  }
};

const flush = (): void => {
  flushScheduled = false;
  const batch = new Map(waiting);
  waiting.clear();
  const names = [...batch.keys()];

  for (let i = 0; i < names.length; i += MAX_NAMES_PER_REQUEST) {
    void fetchChunk(names.slice(i, i + MAX_NAMES_PER_REQUEST), batch);
  }
};

const requestIcon = (name: string): Promise<string> =>
  new Promise((resolve) => {
    const resolvers = waiting.get(name);
    if (resolvers) resolvers.push(resolve);
    else waiting.set(name, [resolve]);

    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 0);
    }
  });

export const Icon = (props: Props): JSX.Element => {
  // Resolve synchronously when cached so there's no flash.
  const [iconPath, setIconPath] = useState<string>(() => cache.get(props.icon) ?? '');

  useEffect(() => {
    let active = true;

    const cached = cache.get(props.icon);
    if (cached) {
      setIconPath(cached);
      return;
    }

    requestIcon(props.icon).then((path) => {
      if (active) setIconPath(path);
    });

    return () => {
      active = false;
    };
  }, [props.icon]);

  return (
    <MDIcon
      className={classes.Icon}
      path={iconPath}
      color={props.color ? props.color : 'var(--color-primary)'}
    />
  );
};
