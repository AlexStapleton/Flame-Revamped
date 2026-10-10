// Resolves the MDI icon names used by apps and bookmarks to their SVG path
// strings, so list responses can carry them and the homescreen doesn't need a
// separate GET /api/icons round trip after the data arrives.

const NAME_RE = /^mdi[A-Z][A-Za-z0-9]*$/;

// @mdi/js is ~2.7 MB; load it on first use, not at startup.
let mdiModule = null;
const loadMdi = () => {
  if (!mdiModule) mdiModule = require('@mdi/js');
  return mdiModule;
};

// Mirrors the client's iconParser ('home-assistant' -> 'mdiHomeAssistant').
// Returns null for anything that isn't a plain MDI name (URLs, uploaded files,
// empty values), which the client renders without an MDI path.
const toMdiName = (icon) => {
  if (typeof icon !== 'string' || icon.length === 0) return null;
  const words = icon.split('-');
  if (words.some((w) => w.length === 0)) return null;
  const name = `mdi${words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;
  return NAME_RE.test(name) ? name : null;
};

// Returns { mdiName: path } for every known MDI icon in `icons`. Unknown names
// are omitted, so the client falls back to its own lookup for them.
const iconPathsFor = (icons, load = loadMdi) => {
  const names = new Set();
  for (const icon of icons) {
    const name = toMdiName(icon);
    if (name) names.add(name);
  }
  if (names.size === 0) return {};

  const mdi = load();
  const out = {};
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(mdi, name) && typeof mdi[name] === 'string') {
      out[name] = mdi[name];
    }
  }
  return out;
};

module.exports = { NAME_RE, loadMdi, toMdiName, iconPathsFor };
