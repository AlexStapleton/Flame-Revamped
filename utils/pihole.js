const http = require('node:http');
const https = require('node:https');
const loadConfig = require('./loadConfig');
const Logger = require('./Logger');

const logger = new Logger();

// Pi-hole v6 REST API client. Flame's server is the only thing that talks to
// Pi-hole, so the app password never reaches the browser; the homescreen widget
// reads the summary from GET /api/pihole.
//
// v6 auth: POST /api/auth { password } returns a session id (sid) that is sent
// as the X-FTL-SID header. Pi-hole caps concurrent sessions (16 by default), so
// one session is kept and reused until Pi-hole rejects it, rather than logging
// in on every refresh. With no password set on Pi-hole, auth returns a valid
// session without a sid and requests need no header.

const REQUEST_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 256 * 1024;
// Results (good or bad) are reused for this long, so many open dashboards and a
// down Pi-hole both cost at most one round trip per window.
const CACHE_TTL_MS = 30 * 1000;

// Turn what the user typed into the API base URL. Accepts "http://pi.hole",
// "http://pi.hole/", "http://pi.hole/admin" or ".../api". Returns null for
// anything that isn't an http(s) URL. Pure.
const normalizeBaseUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(admin|api)$/i, '');
  return `${url.origin}${path}`;
};

// Minimal JSON request over node:http/https. Used instead of fetch because the
// "skip certificate check" option (Pi-hole v6 ships a self-signed cert) needs
// rejectUnauthorized, which fetch has no public option for.
const requestJson = (url, { method = 'GET', headers = {}, body, insecure = false } = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const req = lib.request(
      target,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        rejectUnauthorized: !insecure,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy(new Error('Pi-hole response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            // Not JSON (e.g. an HTML page when the URL points at the wrong host).
          }
          resolve({ status: res.statusCode, data });
        });
        res.on('error', reject);
      }
    );

    req.on('timeout', () => req.destroy(new Error('Pi-hole request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

// Shape the two v6 responses into what the widget shows. Pure.
const mapStats = (summary, blocking) => {
  const queries = (summary && summary.queries) || {};
  const gravity = (summary && summary.gravity) || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    queries: num(queries.total),
    blocked: num(queries.blocked),
    percentBlocked: num(queries.percent_blocked),
    domainsBlocked: num(gravity.domains_being_blocked),
    // "enabled" | "disabled" | "failed" | "unknown"
    blocking: typeof blocking?.blocking === 'string' ? blocking.blocking : 'unknown',
  };
};

class PiholeError extends Error {}

const createPiholeClient = ({
  request = requestJson,
  getConfig = loadConfig,
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  // Called once per failed round trip (not for cached replays), so a down
  // Pi-hole logs at most once per cache window however many tabs are open.
  onError = (err) => logger.log(`Pi-hole: ${err.message}`, 'WARN'),
} = {}) => {
  // Session and cache belong to one (url, password, tls) combination. When the
  // settings change, both are dropped and the old session is logged out.
  let sessionKey = null;
  let sid = null; // null + hasSession = Pi-hole has no password
  let hasSession = false;
  let cache = null; // { at, key, value } or { at, key, error }
  let inFlight = null;

  const readSettings = async () => {
    const config = await getConfig();
    const baseUrl = normalizeBaseUrl(config.piholeUrl);
    return {
      baseUrl,
      password: config.PIHOLE_PASSWORD || '',
      insecure: Boolean(config.piholeSkipTlsVerify),
    };
  };

  const keyOf = (s) => JSON.stringify([s.baseUrl, s.password, s.insecure]);

  const logout = (settings, oldSid) => {
    if (!oldSid || !settings.baseUrl) return;
    request(`${settings.baseUrl}/api/auth`, {
      method: 'DELETE',
      headers: { 'X-FTL-SID': oldSid },
      insecure: settings.insecure,
    }).catch(() => {});
  };

  const login = async (s) => {
    const res = await request(`${s.baseUrl}/api/auth`, {
      method: 'POST',
      body: { password: s.password },
      insecure: s.insecure,
    });
    const session = res.data && res.data.session;
    if (res.status === 429) {
      throw new PiholeError('Pi-hole is rate limiting logins, try again later');
    }
    if (res.status !== 200 || !session || !session.valid) {
      throw new PiholeError(
        res.status === 401 || (session && session.valid === false)
          ? 'Pi-hole rejected the password'
          : `Unexpected response from Pi-hole login (HTTP ${res.status})`
      );
    }
    sid = session.sid || null;
    hasSession = true;
  };

  const authedGet = async (s, path) => {
    const headers = sid ? { 'X-FTL-SID': sid } : {};
    return request(`${s.baseUrl}${path}`, { headers, insecure: s.insecure });
  };

  // GET a v6 endpoint, logging in first if needed and once more if Pi-hole has
  // expired the session.
  const getWithSession = async (s, path) => {
    if (!hasSession) await login(s);
    let res = await authedGet(s, path);
    if (res.status === 401) {
      hasSession = false;
      sid = null;
      await login(s);
      res = await authedGet(s, path);
    }
    if (res.status !== 200 || !res.data) {
      throw new PiholeError(`Unexpected response from Pi-hole (HTTP ${res.status})`);
    }
    return res.data;
  };

  const fetchStats = async (s) => {
    const key = keyOf(s);
    if (key !== sessionKey) {
      if (sessionKey) {
        const [oldUrl, , oldInsecure] = JSON.parse(sessionKey);
        logout({ baseUrl: oldUrl, insecure: oldInsecure }, sid);
      }
      sessionKey = key;
      sid = null;
      hasSession = false;
    }
    try {
      const summary = await getWithSession(s, '/api/stats/summary');
      const blocking = await getWithSession(s, '/api/dns/blocking');
      return mapStats(summary, blocking);
    } catch (err) {
      if (err instanceof PiholeError) throw err;
      throw new PiholeError(`Can't reach Pi-hole: ${err.message}`);
    }
  };

  // Returns { configured: false } when no URL is set, otherwise the stats.
  // Throws PiholeError on failure. `fresh` skips the cache (settings "test").
  const getStats = async ({ fresh = false } = {}) => {
    const s = await readSettings();
    if (!s.baseUrl) return { configured: false };

    const key = keyOf(s);
    if (!fresh && cache && cache.key === key && now() - cache.at < ttlMs) {
      if (cache.error) throw cache.error;
      return cache.value;
    }
    // A request already in flight is fresh enough, and joining it avoids two
    // concurrent logins (each would take a Pi-hole session slot).
    if (inFlight && inFlight.key === key) return inFlight.promise;

    const promise = fetchStats(s)
      .then((stats) => {
        const value = { configured: true, ...stats };
        cache = { at: now(), key, value };
        return value;
      })
      .catch((error) => {
        cache = { at: now(), key, error };
        onError(error);
        throw error;
      })
      .finally(() => {
        if (inFlight && inFlight.promise === promise) inFlight = null;
      });
    inFlight = { key, promise };
    return promise;
  };

  return { getStats };
};

module.exports = {
  createPiholeClient,
  normalizeBaseUrl,
  mapStats,
  requestJson,
  PiholeError,
  pihole: createPiholeClient(),
};
