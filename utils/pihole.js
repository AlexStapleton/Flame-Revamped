const http = require('node:http');
const https = require('node:https');
const loadConfig = require('./loadConfig');
const Logger = require('./Logger');

const logger = new Logger();

// Pi-hole client (v6 REST API and the legacy v5 api.php). Flame's server is
// the only thing that talks to Pi-hole, so passwords and API tokens never
// reach the browser; the homescreen widget reads summaries from GET
// /api/pihole. Several Pi-holes can be configured; each has its own client.
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

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Shape the two v6 responses into what the widget shows. Pure.
const mapStats = (summary, blocking) => {
  const queries = (summary && summary.queries) || {};
  const gravity = (summary && summary.gravity) || {};
  return {
    queries: num(queries.total),
    blocked: num(queries.blocked),
    percentBlocked: num(queries.percent_blocked),
    domainsBlocked: num(gravity.domains_being_blocked),
    // "enabled" | "disabled" | "failed" | "unknown"
    blocking: typeof blocking?.blocking === 'string' ? blocking.blocking : 'unknown',
  };
};

// Shape a v5 `api.php?summaryRaw` response the same way. Pure.
const mapStatsV5 = (raw) => ({
  queries: num(raw.dns_queries_today),
  blocked: num(raw.ads_blocked_today),
  percentBlocked: num(raw.ads_percentage_today),
  domainsBlocked: num(raw.domains_being_blocked),
  blocking: raw.status === 'enabled' || raw.status === 'disabled' ? raw.status : 'unknown',
});

class PiholeError extends Error {}

// Settings for one Pi-hole, as the client needs them:
// { baseUrl, version: 5 | 6, password, insecure }
const keyOf = (s) => JSON.stringify([s.baseUrl, s.version, s.password, s.insecure]);

// Client for ONE Pi-hole. Keeps that Pi-hole's v6 session and the cached
// result. Settings are passed on every call; when they change, the session and
// cache are dropped and the old v6 session is logged out.
const createPiholeClient = ({
  request = requestJson,
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  // Called once per failed round trip (not for cached replays), so a down
  // Pi-hole logs at most once per cache window however many tabs are open.
  onError = (err) => logger.log(`Pi-hole: ${err.message}`, 'WARN'),
} = {}) => {
  let sessionSettings = null;
  let sid = null; // null + hasSession = Pi-hole has no password
  let hasSession = false;
  let cache = null; // { at, key, value } or { at, key, error }
  let inFlight = null;

  const logout = () => {
    const s = sessionSettings;
    if (!s || s.version !== 6 || !sid) return;
    request(`${s.baseUrl}/api/auth`, {
      method: 'DELETE',
      headers: { 'X-FTL-SID': sid },
      insecure: s.insecure,
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

  const fetchV6 = async (s) => {
    const summary = await getWithSession(s, '/api/stats/summary');
    const blocking = await getWithSession(s, '/api/dns/blocking');
    return mapStats(summary, blocking);
  };

  // v5: one GET with the API token (Settings > API in the v5 web UI) in the
  // query string. A wrong or missing token gets HTTP 200 with an empty array.
  // The URL holds the token, so it is never put into an error message.
  const fetchV5 = async (s) => {
    const auth = s.password ? `&auth=${encodeURIComponent(s.password)}` : '';
    const res = await request(`${s.baseUrl}/admin/api.php?summaryRaw${auth}`, {
      insecure: s.insecure,
    });
    if (res.status !== 200) {
      throw new PiholeError(`Unexpected response from Pi-hole (HTTP ${res.status})`);
    }
    if (Array.isArray(res.data)) {
      throw new PiholeError(
        s.password ? 'Pi-hole rejected the API token' : 'Pi-hole needs an API token'
      );
    }
    if (!res.data || res.data.dns_queries_today === undefined) {
      throw new PiholeError('Unexpected response from Pi-hole (is it v5?)');
    }
    return mapStatsV5(res.data);
  };

  const fetchStats = async (s) => {
    if (!sessionSettings || keyOf(s) !== keyOf(sessionSettings)) {
      logout();
      sessionSettings = s;
      sid = null;
      hasSession = false;
    }
    try {
      return await (s.version === 5 ? fetchV5(s) : fetchV6(s));
    } catch (err) {
      if (err instanceof PiholeError) throw err;
      throw new PiholeError(`Can't reach Pi-hole: ${err.message}`);
    }
  };

  // Resolves to the stats, throws PiholeError on failure. `fresh` skips the
  // cache (settings "test").
  const getStats = async (s, { fresh = false } = {}) => {
    const key = keyOf(s);
    if (!fresh && cache && cache.key === key && now() - cache.at < ttlMs) {
      if (cache.error) throw cache.error;
      return cache.value;
    }
    // A request already in flight is fresh enough, and joining it avoids two
    // concurrent logins (each would take a Pi-hole session slot).
    if (inFlight && inFlight.key === key) return inFlight.promise;

    const promise = fetchStats(s)
      .then((value) => {
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

  // Called when this Pi-hole is removed from settings.
  const dispose = () => {
    logout();
    sessionSettings = null;
    cache = null;
  };

  return { getStats, dispose };
};

const MAX_PIHOLES = 10;

// Read the Pi-hole list out of config. config.piholes holds the non-secret
// part of each entry and config.PIHOLE_SECRETS maps id -> password / API token
// (a separate top-level key so backups can strip it like WEATHER_API_KEY).
// Entries without a usable URL or id are skipped. Pure.
const readInstances = (config) => {
  const list = Array.isArray(config.piholes) ? config.piholes : [];
  const secrets =
    config.PIHOLE_SECRETS && typeof config.PIHOLE_SECRETS === 'object'
      ? config.PIHOLE_SECRETS
      : {};
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.slice(0, 64) : '';
    const baseUrl = normalizeBaseUrl(entry.url);
    if (!id || !baseUrl || seen.has(id)) continue;
    seen.add(id);
    const secret = secrets[id];
    out.push({
      id,
      name:
        typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim().slice(0, 40)
          : 'Pi-hole',
      settings: {
        baseUrl,
        version: Number(entry.version) === 5 ? 5 : 6,
        password: typeof secret === 'string' ? secret : '',
        insecure: Boolean(entry.skipTlsVerify),
      },
    });
    if (out.length >= MAX_PIHOLES) break;
  }
  return out;
};

// All configured Pi-holes, each with its own client (session + cache).
const createPiholeManager = ({
  getConfig = loadConfig,
  clientFactory = () => createPiholeClient(),
} = {}) => {
  const clients = new Map();

  // Resolves to one entry per Pi-hole, in settings order:
  // { id, name, ok: true, ...stats } or { id, name, ok: false, error }.
  // Never rejects for a Pi-hole failure; each entry reports its own.
  const getAll = async ({ fresh = false } = {}) => {
    const instances = readInstances(await getConfig());

    // Drop clients for Pi-holes that were removed.
    const ids = new Set(instances.map((i) => i.id));
    for (const [id, client] of clients) {
      if (!ids.has(id)) {
        client.dispose();
        clients.delete(id);
      }
    }

    return Promise.all(
      instances.map(async ({ id, name, settings }) => {
        if (!clients.has(id)) clients.set(id, clientFactory());
        try {
          const stats = await clients.get(id).getStats(settings, { fresh });
          return { id, name, ok: true, ...stats };
        } catch (err) {
          if (!(err instanceof PiholeError)) throw err;
          return { id, name, ok: false, error: err.message };
        }
      })
    );
  };

  return { getAll };
};

module.exports = {
  createPiholeClient,
  createPiholeManager,
  readInstances,
  normalizeBaseUrl,
  mapStats,
  mapStatsV5,
  requestJson,
  PiholeError,
  MAX_PIHOLES,
  piholes: createPiholeManager(),
};
