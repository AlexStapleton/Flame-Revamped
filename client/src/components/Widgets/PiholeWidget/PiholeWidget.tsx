import { Fragment, useEffect, useState } from 'react';
import { Icon as MDIcon } from '@mdi/react';
import { mdiShieldCheck, mdiShieldOff } from '@mdi/js';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import { ApiResponse, PiholeResult } from '../../../interfaces';

// Utils
import { http } from '../../../utility/http';
import { applyAuth } from '../../../utility';

// CSS
import classes from './PiholeWidget.module.css';

// The server caches each Pi-hole's answer for 30 seconds, so polling every
// minute costs each Pi-hole at most one call per minute however many tabs are
// open.
const REFRESH_MS = 60 * 1000;

const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat();

const blockingLabel = (blocking: string, timer: number | null): string => {
  if (blocking === 'enabled') return 'Blocking on';
  if (blocking !== 'disabled') return 'Blocking status unknown';
  if (timer && timer > 0) {
    const mins = Math.ceil(timer / 60);
    return `Blocking off, back on in ${timer < 60 ? `${Math.ceil(timer)} s` : `${mins} min`}`;
  }
  return 'Blocking off';
};

// "for 5 minutes" / "until clicked again", from the piholeDisableSeconds setting.
const pauseLabel = (seconds: number): string => {
  if (!seconds || seconds <= 0) return 'until you click again';
  if (seconds < 60) return `for ${seconds} seconds`;
  if (seconds < 3600) return `for ${Math.round(seconds / 60)} minutes`;
  const hours = Math.round(seconds / 3600);
  return `for ${hours} hour${hours === 1 ? '' : 's'}`;
};

// One row per configured Pi-hole, under a shared header of column labels.
export const PiholeWidget = (): JSX.Element | null => {
  const { loading: configLoading, config } = useSelector(
    (state: State) => state.config
  );
  const isAuthenticated = useSelector(
    (state: State) => state.auth.isAuthenticated
  );
  const dispatch = useDispatch();
  const { createNotification } = bindActionCreators(actionCreators, dispatch);
  const enabled =
    !configLoading && Array.isArray(config.piholes) && config.piholes.length > 0;
  // Refetch when the list of Pi-holes changes (added, removed, renamed).
  const listKey = enabled
    ? config.piholes.map((p) => `${p.id}:${p.name}`).join('|')
    : '';

  const [results, setResults] = useState<PiholeResult[]>([]);
  // Ids of Pi-holes with a blocking change in flight.
  const [pending, setPending] = useState<string[]>([]);

  // Admin only: the server rejects this for guests, and guests get no button.
  const toggleBlocking = (id: string, enable: boolean) => {
    if (pending.includes(id)) return;
    setPending((p) => [...p, id]);
    http
      .post<ApiResponse<PiholeResult>>(
        `/api/pihole/${encodeURIComponent(id)}/blocking`,
        { enabled: enable },
        { headers: applyAuth() }
      )
      .then((res) => {
        const updated = res.data.data;
        setResults((prev) => prev.map((r) => (r.id === id ? updated : r)));
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response?.data?.error || 'Could not change Pi-hole blocking',
        });
      })
      .finally(() => setPending((p) => p.filter((x) => x !== id)));
  };

  // Fetch now and every minute while the tab is visible. A hidden tab stops
  // polling and refreshes as soon as it is shown again.
  useEffect(() => {
    if (!enabled) {
      setResults([]);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const load = () => {
      http
        .get<ApiResponse<PiholeResult[]>>('/api/pihole', {
          headers: applyAuth(),
        })
        .then((res) => {
          if (!cancelled) setResults(res.data.data || []);
        })
        .catch(() => {
          // Flame itself is unreachable: keep the last results on screen.
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
  }, [enabled, listKey]);

  if (!enabled || results.length === 0) return null;

  return (
    <div className={classes.PiholeWidget}>
      <span />
      <span />
      <span className={classes.Label}>Queries</span>
      <span className={classes.Label}>Blocked</span>
      <span className={classes.Label}>Blocklist</span>

      {results.map((r) => {
        if (!r.ok) {
          return (
            <Fragment key={r.id}>
              <MDIcon
                className={`${classes.PiholeIcon} ${classes.Off}`}
                path={mdiShieldOff}
                color="var(--color-primary)"
                title={r.error}
              />
              <span className={classes.Name}>{r.name}</span>
              <span className={classes.Error} title={r.error}>
                unreachable
              </span>
            </Fragment>
          );
        }

        const on = r.blocking === 'enabled';
        const status = `${r.name}: ${blockingLabel(r.blocking, r.timer)}`;
        const icon = (
          <MDIcon
            className={`${classes.PiholeIcon} ${on ? '' : classes.Off}`}
            path={on ? mdiShieldCheck : mdiShieldOff}
            color="var(--color-primary)"
          />
        );
        const busy = pending.includes(r.id);
        return (
          <Fragment key={r.id}>
            {isAuthenticated ? (
              <button
                type="button"
                className={`${classes.ShieldButton} ${busy ? classes.Busy : ''}`}
                disabled={busy}
                onClick={() => toggleBlocking(r.id, !on)}
                title={`${status}. Click to ${
                  on
                    ? `pause blocking ${pauseLabel(config.piholeDisableSeconds)}`
                    : 'turn blocking back on'
                }.`}
                aria-label={
                  on ? `Pause blocking on ${r.name}` : `Turn blocking back on for ${r.name}`
                }
              >
                {icon}
              </button>
            ) : (
              <span className={classes.Shield} title={status}>
                {icon}
              </span>
            )}
            <span className={classes.Name}>{r.name}</span>
            <span className={classes.Value}>{whole.format(r.queries)}</span>
            <span className={classes.Value}>
              {whole.format(r.blocked)} ({r.percentBlocked.toFixed(1)}%)
            </span>
            <span
              className={classes.Value}
              title={`${whole.format(r.domainsBlocked)} domains`}
            >
              {compact.format(r.domainsBlocked)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
};
