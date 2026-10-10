const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const fetchText = require('../utils/fetchText');
const loadConfig = require('../utils/loadConfig');
const { auth } = require('../middleware');
const {
  parseRemoteVersion,
  isAllowedRemoteUrl,
  createCachedLoader,
} = require('../utils/versionCheck');

function tryReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Local identity + repo coordinates (package.json, versionCheck.json, env overrides).
// package.json and versionCheck.json only change on deploy, so the result is
// memoized after package.json parses. A failed package.json read is not cached.
let cachedLocalInfo = null;

function readLocalInfo() {
  const root = path.resolve(__dirname, '..');

  // package.json
  const pkgRaw = tryReadJSON(path.join(root, 'package.json'));
  const pkg = pkgRaw || {};
  const name = typeof pkg?.name === 'string' ? pkg.name : null;
  const version = typeof pkg?.version === 'string' ? pkg.version : null;

  // client/versionCheck.json
  const cfg =
    tryReadJSON(path.join(root, 'public', 'versionCheck.json')) ||
    tryReadJSON(path.join(root, 'client', 'versionCheck.json')) ||
    {};

  // .env override
  const owner   = process.env.OWNER  || cfg.owner  || 'AlexStapleton';
  const repo    = process.env.REPO   || cfg.repo   || 'Flame-Revamped';
  const branches = {
    stable: process.env.BRANCH_STABLE || cfg?.branches?.stable || 'main',
    dev:    process.env.BRANCH_DEV    || cfg?.branches?.dev    || 'main',
  };

  return { info: { name, version, owner, repo, branches }, cacheable: pkgRaw !== null };
}

function getLocalInfo() {
  if (!cachedLocalInfo) {
    const { info, cacheable } = readLocalInfo();
    if (!cacheable) return info;
    cachedLocalInfo = info;
  }
  // Hand out a copy so callers cannot mutate the memoized object.
  return { ...cachedLocalInfo, branches: { ...cachedLocalInfo.branches } };
}

router.get('/', (_req, res) => {
  try {
    res.json(getLocalInfo());
  } catch (error) {
    console.error('Failed to read version/config:', error);
    res.status(500).json({ error: 'Could not retrieve version', name: null, version: null });
  }
});

// ---- Server-side update check -------------------------------------------------
// The browser no longer contacts the remote host (privacy + tighter CSP).
// Only https: remotes are allowed. The remote is normally GitHub; a homelab admin
// who needs a private source can serve the file over https. Flip to true to also
// accept http:.
const ALLOW_HTTP = false;

const fetchRemoteText = (url) =>
  fetchText(url, { timeoutMs: 5000, maxBytes: 256 * 1024 });

const defaultRawBase = (info) => {
  const branch = info.name === 'flame-dev' ? info.branches.dev : info.branches.stable;
  return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${branch}`;
};

// Decide which URL to check: admin-configured updateUrl when defaults are off.
async function resolveRemoteUrl() {
  const info = getLocalInfo();
  let config = {};
  try { config = await loadConfig(); } catch { /* fall back to defaults */ }
  const custom = typeof config.updateUrl === 'string' ? config.updateUrl.trim() : '';
  if (config.useDefaults === false && custom) {
    return { url: custom, isDefault: false, info };
  }
  return { url: `${defaultRawBase(info)}/package.json`, isDefault: true, info };
}

const loadVersion = createCachedLoader({
  load: async (url) => {
    const version = parseRemoteVersion(await fetchRemoteText(url));
    if (!version) throw new Error('Unable to parse remote version');
    return version;
  },
});

const loadChangelog = createCachedLoader({
  load: async (url) => {
    const text = String(await fetchRemoteText(url)).trim();
    if (!text) throw new Error('Empty changelog');
    return text;
  },
});

const forceOpts = (req) => ({
  force: req.query.force === '1',
  canForce: req.isAuthenticated === true,
});

router.get('/latest', auth, async (req, res) => {
  try {
    const { url, isDefault } = await resolveRemoteUrl();
    if (!isAllowedRemoteUrl(url, { allowHttp: ALLOW_HTTP })) {
      throw new Error('Remote URL scheme not allowed');
    }
    const remoteVersion = await loadVersion(url, forceOpts(req));
    res.json({ success: true, data: { remoteVersion, remoteUrl: url, isDefault } });
  } catch (error) {
    console.error('Update check failed:', error && error.message);
    res.status(502).json({ success: false, error: 'Update check failed' });
  }
});

// Remote changelog (default repo only; custom update URLs have no known changelog).
router.get('/latest/changelog', auth, async (req, res) => {
  try {
    const { isDefault, info } = await resolveRemoteUrl();
    if (!isDefault) {
      return res.status(404).json({ success: false, error: 'Not available' });
    }
    const changelog = await loadChangelog(`${defaultRawBase(info)}/CHANGELOG.md`, forceOpts(req));
    res.json({ success: true, data: { changelog } });
  } catch (error) {
    console.error('Remote changelog failed:', error && error.message);
    res.status(502).json({ success: false, error: 'Update check failed' });
  }
});

module.exports = router;
