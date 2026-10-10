const axios = require('axios');

// Map a probe outcome to a status string. Pure + unit-testable (no network).
const mapResult = (probe) => (probe && probe.ok ? 'online' : 'offline');

// Probe one app's URL. "Reachable" = ANY HTTP response (auth-gated apps return
// 401/403 but are up). Returns { ok, statusCode }.
//
// Only the status line and headers matter, so responses are requested as streams
// and the stream is destroyed as soon as the response arrives. Without this, the
// GET fallback would download the whole body of whatever the host serves.
const probeOpts = {
  timeout: 5000,
  validateStatus: () => true,
  maxRedirects: 5,
  maxContentLength: 64 * 1024,
  responseType: 'stream',
};

const probeOnce = async (method, url) => {
  const res = await axios({ ...probeOpts, method, url });
  // Destroying the body stream alone leaves the socket open (axios may wrap it).
  // Destroying the underlying request closes the connection so the server stops
  // sending the body.
  res.data.destroy();
  if (res.request && typeof res.request.destroy === 'function') res.request.destroy();
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
