// Map a probe outcome to a status string. Pure + unit-testable (no network).
const mapResult = (probe) => (probe && probe.ok ? 'online' : 'offline');

// Probe one app's URL. "Reachable" = ANY HTTP response (auth-gated apps return
// 401/403 but are up). Returns { ok, statusCode }.
//
// Only the status line and headers matter, so the body is cancelled as soon as
// the response arrives. Without this, the GET fallback would download the whole
// body of whatever the host serves. Cancelling it also closes the connection,
// so the server stops sending.
const PROBE_TIMEOUT_MS = 5000;

// fetch refuses URLs with embedded credentials (http://user:pass@host). The
// probe only needs any HTTP response (a 401 still means "up"), so drop them.
const withoutCredentials = (url) => {
  const u = new URL(url);
  u.username = '';
  u.password = '';
  return u.href;
};

const probeOnce = async (method, url) => {
  const res = await fetch(withoutCredentials(url), {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (res.body) await res.body.cancel();
  return { ok: true, statusCode: res.status };
};

const probe = async (url) => {
  try {
    return await probeOnce('HEAD', url);
  } catch (err) {
    // Some servers reject HEAD — retry with GET before declaring offline.
    try {
      return await probeOnce('GET', url);
    } catch (e2) {
      return { ok: false };
    }
  }
};

const checkAppStatus = async (url) => mapResult(await probe(url));

module.exports = { mapResult, probe, checkAppStatus };
