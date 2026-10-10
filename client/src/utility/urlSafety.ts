// Keep in sync with utils/urlSafety.js on the server (same logic, duplicated
// because the client and server cannot share a module).
//
// Denylist (not allowlist): custom schemes such as steam://, ssh://, mailto:
// are legitimate. Only script-capable schemes are blocked.
const DANGEROUS_SCHEMES = ['javascript', 'vbscript', 'data', 'blob', 'file'];

// True if a browser would parse `url` as a dangerous scheme. Normalization
// mirrors the WHATWG URL parser: strip leading C0 control chars and spaces,
// remove ASCII tab/CR/LF anywhere, lowercase. Non-strings return false.
export const isDangerousUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;

  const normalized = url
    .replace(/[\t\n\r]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/^[\u0000- ]+/, '')
    .toLowerCase();

  const match = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  return match !== null && DANGEROUS_SCHEMES.includes(match[1]);
};
