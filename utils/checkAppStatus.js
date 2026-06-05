const axios = require('axios');

// Map a probe outcome to a status string. Pure + unit-testable (no network).
const mapResult = (probe) => (probe && probe.ok ? 'online' : 'offline');

// Probe one app's URL. "Reachable" = ANY HTTP response (auth-gated apps return
// 401/403 but are up). Returns { ok, statusCode }.
const probe = async (url) => {
  const opts = { timeout: 5000, validateStatus: () => true, maxRedirects: 5 };
  try {
    const res = await axios.head(url, opts);
    return { ok: true, statusCode: res.status };
  } catch (err) {
    // Some servers reject HEAD — retry with GET before declaring offline.
    try {
      const res = await axios.get(url, opts);
      return { ok: true, statusCode: res.status };
    } catch (e2) {
      return { ok: false };
    }
  }
};

const checkAppStatus = async (url) => mapResult(await probe(url));

module.exports = { mapResult, probe, checkAppStatus };
