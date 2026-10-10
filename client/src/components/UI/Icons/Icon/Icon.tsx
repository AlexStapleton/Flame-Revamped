import { useEffect, useState } from 'react';
import classes from './Icon.module.css';

import { Icon as MDIcon } from '@mdi/react';
import { getCachedIcon, requestIcon } from './iconCache';

interface Props {
  icon: string;
  color?: string;
}

export const Icon = (props: Props): JSX.Element => {
  // Resolve synchronously when cached so there's no flash.
  const [iconPath, setIconPath] = useState<string>(() => getCachedIcon(props.icon) ?? '');

  useEffect(() => {
    let active = true;

    const cached = getCachedIcon(props.icon);
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
