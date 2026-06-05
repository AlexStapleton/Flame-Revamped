import { useEffect, useState } from 'react';
import classes from './Icon.module.css';

import { Icon as MDIcon } from '@mdi/react';

interface Props {
  icon: string;
  color?: string;
}

// @mdi/js is ~2.8MB (every Material Design Icon path). Because icon names are
// user-chosen and resolved at runtime (MDIcons[name]), the whole set can't be
// tree-shaken. Statically importing it forced that payload onto the initial
// load. Instead we import it dynamically once and cache the module, so it lives
// in its own async chunk off the critical path. After the first load every icon
// resolves synchronously from the cache (no flicker on later renders).
type MdiModule = Record<string, string>;

let mdiCache: MdiModule | null = null;
let mdiPromise: Promise<MdiModule> | null = null;

const loadMdi = (): Promise<MdiModule> => {
  if (mdiCache) return Promise.resolve(mdiCache);
  if (!mdiPromise) {
    mdiPromise = import('@mdi/js').then((mod) => {
      mdiCache = mod as unknown as MdiModule;
      return mdiCache;
    });
  }
  return mdiPromise;
};

const resolvePath = (mdi: MdiModule, name: string): string =>
  mdi[name] || mdi.mdiCancel;

export const Icon = (props: Props): JSX.Element => {
  // If the set is already loaded, resolve synchronously so there's no flash.
  const [iconPath, setIconPath] = useState<string>(() =>
    mdiCache ? resolvePath(mdiCache, props.icon) : ''
  );

  useEffect(() => {
    let active = true;

    if (mdiCache) {
      setIconPath(resolvePath(mdiCache, props.icon));
      return;
    }

    loadMdi().then((mdi) => {
      if (active) setIconPath(resolvePath(mdi, props.icon));
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
