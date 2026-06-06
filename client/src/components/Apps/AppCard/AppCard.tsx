import { memo } from 'react';
import classes from './AppCard.module.css';
import { Icon } from '../../UI';
import {
  dashboardIconUrl,
  iconParser,
  isImage,
  isSvg,
  isUrl,
  urlParser,
} from '../../../utility';

import { App } from '../../../interfaces';
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';

interface Props {
  app: App;
}

const AppCardComponent = ({ app }: Props): JSX.Element => {
  // Select only the field this card reads, so unrelated config changes don't
  // re-render every card.
  const appsSameTab = useSelector(
    (state: State) => state.config.config.appsSameTab
  );

  const [displayUrl, redirectUrl] = urlParser(app.url);

  let iconEl: JSX.Element;
  const { icon } = app;

  const dashUrl = dashboardIconUrl(icon);

  if (dashUrl) {
    iconEl = (
      <img
        src={dashUrl}
        alt={`${app.name} logo`}
        className={classes.CustomIcon}
        draggable={false}
      />
    );
  } else if (isImage(icon)) {
    const source = isUrl(icon) ? icon : `/uploads/${icon}`;

    iconEl = (
      <img
        src={source}
        alt={`${app.name} icon`}
        className={classes.CustomIcon}
        draggable={false}
      />
    );
  } else if (isSvg(icon)) {
    const source = isUrl(icon) ? icon : `/uploads/${icon}`;

    iconEl = (
      <div className={classes.CustomIcon}>
        <svg
          data-src={source}
          fill="var(--color-primary)"
          className={classes.CustomIcon}
        ></svg>
      </div>
    );
  } else {
    iconEl = <Icon icon={iconParser(icon)} />;
  }

  return (
    <a
      href={redirectUrl}
      target={appsSameTab ? '' : '_blank'}
      rel="noreferrer"
      className={classes.AppCard}
      // Disable the browser's native link/image drag. In Firefox a draggable
      // <a> hijacks the mousedown for native drag-and-drop, starving dnd-kit's
      // PointerSensor so the reorder never starts and the release lands as a
      // navigation (the card opens). Chromium doesn't hijack it the same way.
      draggable={false}
    >
      <div className={classes.AppCardIcon}>{iconEl}</div>
      <div className={classes.AppCardDetails}>
        <h5>{app.name}</h5>
        <span>{!app.description.length ? displayUrl : app.description}</span>
      </div>
      {!!app.statusCheckEnabled && app.status && (
        <span
          className={`${classes.StatusDot} ${
            app.status === 'online' ? classes.online : classes.offline
          }`}
          title={`Status: ${app.status}`}
        />
      )}
    </a>
  );
};

// Memoized: when the parent grid re-renders (e.g. on every search keystroke, or
// a config change), cards whose `app` reference is unchanged skip re-rendering.
export const AppCard = memo(AppCardComponent);
