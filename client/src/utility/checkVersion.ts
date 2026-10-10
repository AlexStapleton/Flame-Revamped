import { applyAuth } from './applyAuth';
import { store } from '../store/store';
import { createNotification } from '../store/action-creators';

export type VersionStatus = {
  status: 'new' | 'current' | 'old' | 'error';
  version?: string;
  link?: string;
  remoteUrl?: string;
  changelogRawUrl?: string;
};

// parse numbers.dots => ver2.8.0-rc1 => 2.8.0
function extractCoreVersion(s?: string | null): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)+)/);
  return m ? m[1] : null;
}

// COMPARE
function cmpSemverCore(a: string, b: string): number {
  const A = a.split('.').map(n => parseInt(n, 10));
  const B = b.split('.').map(n => parseInt(n, 10));
  const L = Math.max(A.length, B.length);
  for (let i = 0; i < L; i++) {
    const ai = A[i] ?? 0, bi = B[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

// import JSON
type AppInfo = {
  name?: string | null;
  version?: string | null;
  owner?: string;
  repo?: string;
  branches?: { stable?: string; dev?: string };
};


async function getLocalAppInfo(): Promise<AppInfo> {
  try {
    const res = await fetch('/api/version');
    return await res.json();
  } catch {
    return {};
  }
}

type LatestInfo = { remoteVersion: string; remoteUrl: string; isDefault: boolean };

// The remote lookup happens on the server (GET /api/version/latest, cached) so the
// browser never contacts the remote host directly.
async function getLatestInfo(isForced: boolean): Promise<LatestInfo> {
  const res = await fetch(`/api/version/latest${isForced ? '?force=1' : ''}`, { headers: applyAuth() });
  if (!res.ok) throw new Error('Update check failed');
  const body = await res.json();
  const d = body?.data;
  if (!body?.success || !d || typeof d.remoteVersion !== 'string') throw new Error('Update check failed');
  return d as LatestInfo;
}

// https://github.com/<owner>/<repo> => raw GH URL
function deriveGithubHome(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return;
  try {
    const u = new URL(remoteUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 2) {
      const [owner, repo] = parts;
      return `https://github.com/${owner}/${repo}`;
    }
    if (u.hostname === 'github.com' && parts.length >= 2) {
      const [owner, repo] = parts;
      return `https://github.com/${owner}/${repo}`;
    }
  } catch {}
  return;
}

export async function checkVersion(
  isForced: boolean = false,
  // Ignored: the server decides the remote URL from its saved config
  // (useDefaults/updateUrl). Kept so existing call sites keep compiling.
  _urlOverride?: string,
  showNotifications: boolean = true
): Promise<VersionStatus> {
  const { name: pkgName, version: localVersionMaybe, owner, repo, branches } = await getLocalAppInfo();

  // Fallbacks if /api/version is unreachable. The server normally supplies these
  // (its own defaults point at this repo); keep them in sync with routes/version.js.
  const ownerRepo = `${owner || 'AlexStapleton'}/${repo || 'Flame-Revamped'}`;
  const branch = (pkgName === 'flame-dev')
    ? (branches?.dev || 'main')
    : (branches?.stable || 'main');

  const defaults = {
    changelog:   `https://github.com/${ownerRepo}/blob/${branch}/CHANGELOG.md`,
    changelogRaw:`https://raw.githubusercontent.com/${ownerRepo}/${branch}/CHANGELOG.md`,
  };

  try {
    const latest = await getLatestInfo(isForced);
    const remoteUrl = latest.remoteUrl;
    const isDefault = latest.isDefault;

    // link target => custom => repo home | default => hardcoded
    const customLink = deriveGithubHome(remoteUrl);
    const linkForUpdate = isDefault ? defaults.changelog : customLink;

    // Signals that a remote changelog is available (fetched via the server).
    const changelogRawUrl = isDefault ? defaults.changelogRaw : undefined;

    const remoteVersion = extractCoreVersion(latest.remoteVersion);
    const localVersionRaw = typeof localVersionMaybe === 'string' ? localVersionMaybe : undefined;
    const localVersion = extractCoreVersion(localVersionRaw) || undefined;

    if (!remoteVersion) throw new Error('Unable to parse remote version');

    if (!localVersion) {
      if (isForced && showNotifications) {
        store.dispatch<any>(createNotification({ title: 'Error', message: 'Could not read local version.' }));
      }
      return { status: 'error', version: remoteVersion, link: linkForUpdate, remoteUrl, changelogRawUrl };
    }

    const cmp = cmpSemverCore(remoteVersion, localVersion)

    if (cmp > 0) {
      if (showNotifications) {
        store.dispatch<any>(createNotification({
          title: 'Info',
          message: `New version is available! (${remoteVersion})`,
          url: linkForUpdate,
        }));
      }
      return { status: 'new', version: remoteVersion, link: linkForUpdate, remoteUrl, changelogRawUrl };
    }

    if (cmp === 0) {
      if (isForced && showNotifications) {
        store.dispatch<any>(createNotification({
          title: 'Info',
          message: 'You are using the latest version!',
        }));
      }
      return { status: 'current', version: remoteVersion, link: linkForUpdate, remoteUrl, changelogRawUrl };
    }

    // local is newer ??
    if (isForced && showNotifications) {
      store.dispatch<any>(createNotification({
        title: 'Info',
        message: 'You are ahead of the remote version.',
      }));
    }
    return { status: 'old', version: remoteVersion, link: linkForUpdate, remoteUrl, changelogRawUrl };
  } catch (err) {
    console.error('Update Check Error:', err);
    if (isForced && showNotifications) {
      store.dispatch<any>(createNotification({
        title: 'Error',
        message: 'Failed to check for updates. Check URL and network.',
      }));
    }
    return { status: 'error' };
  }
}
