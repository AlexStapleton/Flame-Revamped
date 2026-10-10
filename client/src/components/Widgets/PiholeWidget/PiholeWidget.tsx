import { useEffect, useState } from 'react';
import { Icon as MDIcon } from '@mdi/react';
import { mdiShieldCheck, mdiShieldOff } from '@mdi/js';

// Redux
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';

// Typescript
import { ApiResponse, PiholeStats } from '../../../interfaces';

// Utils
import { http } from '../../../utility/http';
import { applyAuth } from '../../../utility';

// CSS
import classes from './PiholeWidget.module.css';

// The server caches Pi-hole's answer for 30 seconds, so polling every minute
// costs Pi-hole at most one call per minute however many tabs are open.
const REFRESH_MS = 60 * 1000;

const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat();

export const PiholeWidget = (): JSX.Element | null => {
  const { loading: configLoading, config } = useSelector(
    (state: State) => state.config
  );
  // For guests the server sends 'true' instead of the real URL.
  const enabled = !configLoading && Boolean(config.piholeUrl);

  const [stats, setStats] = useState<PiholeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch now and every minute while the tab is visible. A hidden tab stops
  // polling and refreshes as soon as it is shown again.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: number | null = null;

    const load = () => {
      http
        .get<ApiResponse<PiholeStats | null>>('/api/pihole', {
          headers: applyAuth(),
        })
        .then((res) => {
          if (cancelled) return;
          setStats(res.data.data);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.response?.data?.error || 'Pi-hole is unreachable');
        });
    };

    const start = () => {
      if (timer !== null) return;
      load();
      timer = window.setInterval(load, REFRESH_MS);
    };

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () =>
      document.visibilityState === 'visible' ? start() : stop();

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  if (!enabled || (!stats && !error)) return null;

  if (error || !stats) {
    return (
      <div className={classes.PiholeWidget} title={error || undefined}>
        <MDIcon
          className={classes.PiholeIcon}
          path={mdiShieldOff}
          color="var(--color-primary)"
        />
        <div className={classes.PiholeError}>
          <span>Pi-hole</span>
          <span>unreachable</span>
        </div>
      </div>
    );
  }

  const blockingOn = stats.blocking === 'enabled';
  const blockingLabel = blockingOn
    ? 'Blocking on'
    : stats.blocking === 'disabled'
      ? 'Blocking off'
      : 'Blocking status unknown';

  return (
    <div
      className={classes.PiholeWidget}
      title={`Pi-hole: ${blockingLabel}. ${whole.format(
        stats.domainsBlocked
      )} domains on the blocklist.`}
    >
      <MDIcon
        className={`${classes.PiholeIcon} ${blockingOn ? '' : classes.Off}`}
        path={blockingOn ? mdiShieldCheck : mdiShieldOff}
        color="var(--color-primary)"
        title={blockingLabel}
      />
      <div className={classes.PiholeStats}>
        <div className={classes.Stat}>
          <span className={classes.Label}>Queries</span>
          <span>{whole.format(stats.queries)}</span>
        </div>
        <div className={classes.Stat}>
          <span className={classes.Label}>Blocked</span>
          <span>
            {whole.format(stats.blocked)} ({stats.percentBlocked.toFixed(1)}%)
          </span>
        </div>
        <div className={classes.Stat}>
          <span className={classes.Label}>Blocklist</span>
          <span>{compact.format(stats.domainsBlocked)}</span>
        </div>
      </div>
    </div>
  );
};
