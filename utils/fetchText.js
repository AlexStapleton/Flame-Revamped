// GET a URL as text with a timeout and a cap on the body size, using Node's
// built-in fetch. Rejects on non-2xx responses (as axios did), on timeout, and
// once the body passes maxBytes, so a misbehaving remote can't make the server
// buffer an unbounded response.
const fetchText = async (url, { timeoutMs = 5000, maxBytes = 256 * 1024 } = {}) => {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    if (res.body) await res.body.cancel();
    throw new Error(`HTTP ${res.status} from ${url}`);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`Response from ${url} is larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

module.exports = fetchText;
