// Server-side "is a newer version available?" helpers. Moved off the browser so
// viewers' IPs are not exposed to the remote host and CSP connect-src need not be
// widened for this feature. Pure functions + a cache factory with an injectable
// loader and clock so everything is unit-testable.

const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FAILURE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// parse numbers.dots => ver2.8.0-rc1 => 2.8.0
const extractCoreVersion = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)+)/);
  return m ? m[1] : null;
};

const parseRemoteVersion = (raw) => {
  if (typeof raw !== 'string') return null;
  try {
    const obj = JSON.parse(raw);
    return extractCoreVersion(obj && obj.version != null ? obj.version : null);
  } catch {
    // .env => VITE_APP_VERSION=...
    const m = raw.match(/^\s*VITE_APP_VERSION\s*=\s*["']?([0-9A-Za-z.\-_]+)["']?\s*$/m);
    return extractCoreVersion(m ? m[1] : null);
  }
};

// Only https is accepted by default. http is allowed only when explicitly
// enabled (allowHttp); the scheme check still rejects file:, ftp:, data:, etc.
const isAllowedRemoteUrl = (url, { allowHttp = false } = {}) => {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'https:') return true;
    return allowHttp && u.protocol === 'http:';
  } catch {
    return false;
  }
};

// Keyed TTL cache around an async `load(key)`.
// - successes cached for successTtl, failures (thrown errors) for failureTtl
// - `force` bypasses the cache only when `canForce` is true
const createCachedLoader = ({
  load,
  now = Date.now,
  successTtl = SUCCESS_TTL_MS,
  failureTtl = FAILURE_TTL_MS,
}) => {
  const cache = new Map(); // key -> { ok, value | error, expires }
  const inflight = new Map();

  return async (key, { force = false, canForce = false } = {}) => {
    const bypass = force && canForce;
    const hit = cache.get(key);
    if (!bypass && hit && hit.expires > now()) {
      if (hit.ok) return hit.value;
      throw hit.error;
    }
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      try {
        const value = await load(key);
        cache.set(key, { ok: true, value, expires: now() + successTtl });
        return value;
      } catch (error) {
        cache.set(key, { ok: false, error, expires: now() + failureTtl });
        throw error;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };
};

module.exports = {
  SUCCESS_TTL_MS,
  FAILURE_TTL_MS,
  extractCoreVersion,
  parseRemoteVersion,
  isAllowedRemoteUrl,
  createCachedLoader,
};
