// Keep in sync with client/src/utility/urlSafety.ts (same logic, duplicated
// because the server and client cannot share a module).
//
// Denylist (not allowlist): users legitimately use custom schemes such as
// steam://, ssh://, vnc://, mailto:. We only block script-capable schemes.
const DANGEROUS_SCHEMES = ['javascript', 'vbscript', 'data', 'blob', 'file'];

// Returns true if `url` would be parsed by a browser as one of the dangerous
// schemes. Normalization mirrors the WHATWG URL parser: strip leading C0
// control chars and spaces, remove ASCII tab/CR/LF anywhere, lowercase.
// Non-strings return false: they are not URLs, and are left to the existing
// model validation to reject. Schemeless input (example.com, localhost:8080,
// /relative) is safe: it gets http:// prefixed or is relative.
const isDangerousUrl = (url) => {
  if (typeof url !== 'string') return false;

  const normalized = url
    .replace(/[\t\n\r]/g, '')
    .replace(/^[\u0000- ]+/, '')
    .toLowerCase();

  const match = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  return match !== null && DANGEROUS_SCHEMES.includes(match[1]);
};

module.exports = { DANGEROUS_SCHEMES, isDangerousUrl };
