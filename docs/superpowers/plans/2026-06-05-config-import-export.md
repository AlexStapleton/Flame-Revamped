# Config/data Import & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated one-click Export (all apps, bookmarks, categories, config, themes, queries, custom CSS → one JSON file) and a Replace-style Import/restore, surfaced as a "Backup & Restore" section in the System settings tab.

**Architecture:** A new `/api/backup` Express resource with `export` (serialize everything) and `import` (validate → safety-snapshot → replace) endpoints, both admin-only. Pure, unit-testable helpers (`validate`, `secrets`, `serialize`) live under `utils/backup/`. Import replaces DB rows in a Sequelize transaction and overwrites the file-backed sources (`config.json`, `themes.json`, `customQueries.json`, `flame.css`) after the commit. The frontend adds Export/Import controls to `AppDetails.tsx`.

**Tech Stack:** Node.js, Express, Sequelize (SQLite), `node:test`, React + TypeScript, Redux.

---

## Reference: established codebase patterns

- **Controllers** wrap handlers in `asyncWrapper` and live one-per-file under `controllers/<resource>/`, re-exported by `controllers/<resource>/index.js`. See `controllers/apps/getAllApps.js`.
- **Routes** are tiny Express routers using `auth` + `requireAuth` from `../middleware`. See `routes/apps.js`. Registered in `api.js` (around line 85).
- **Auth header** is `Authorization-Flame: Bearer <token>` (NOT standard `Authorization`). Server: `middleware/auth.js`. Client: `utility/applyAuth.ts`.
- **File I/O** uses `utils/File.js`: `new File(path).read()` returns a string; `.write(data, true)` writes JSON. Themes use relative path `data/themes.json`; queries use `data/customQueries.json`; CSS uses `path.join(__dirname, '../../public/flame.css')` (see `controllers/config/getCSS.js`).
- **Runtime config** is `data/config.json`, read/cached via `utils/loadConfig.js`. Refresh the cache after writing with `loadConfig.setCache(obj)`.
- **DB handle** for transactions: `const { sequelize } = require('./db')`.
- **Tests** use `node:test` + `node:assert`, files named `test/*.test.js`, run via `npm test`. See `test/checkAppStatus.test.js`.
- **Client notifications**: `createNotification({ title, message })` from `actionCreators` (already imported in `AppDetails.tsx`).

---

## File Structure

**Backend — new:**
- `utils/backup/secrets.js` — secret-key denylist + `stripSecrets(configObj)`.
- `utils/backup/validate.js` — `validateBackup(obj) → { ok, error }`.
- `utils/backup/serialize.js` — `buildBackup() → envelope` (reads all sources).
- `utils/backup/restore.js` — `applyBackup(envelope)` (transactional replace + file writes).
- `controllers/backup/exportData.js`, `controllers/backup/importData.js`, `controllers/backup/index.js`.
- `routes/backup.js`.
- `test/backup.test.js`.

**Backend — modified:**
- `api.js` — register `api.use('/api/backup', require('./routes/backup'))`.

**Frontend — modified:**
- `client/src/components/Settings/AppDetails/AppDetails.tsx` — add "Backup & Restore" UI.
- `client/src/components/Settings/AppDetails/AppDetails.module.css` — styles for the new buttons (if needed).

---

## Task 1: Secret stripping helper

**Files:**
- Create: `utils/backup/secrets.js`
- Test: `test/backup.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/backup.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { SECRET_KEYS, stripSecrets } = require('../utils/backup/secrets');

test('stripSecrets removes WEATHER_API_KEY and keeps everything else', () => {
  const input = { WEATHER_API_KEY: 'abc123', customTitle: 'Flame', appsSameTab: false };
  const out = stripSecrets(input);
  assert.strictEqual(out.WEATHER_API_KEY, undefined);
  assert.strictEqual(out.customTitle, 'Flame');
  assert.strictEqual(out.appsSameTab, false);
});

test('stripSecrets does not mutate its input', () => {
  const input = { WEATHER_API_KEY: 'abc123', customTitle: 'Flame' };
  stripSecrets(input);
  assert.strictEqual(input.WEATHER_API_KEY, 'abc123');
});

test('SECRET_KEYS contains WEATHER_API_KEY', () => {
  assert.ok(SECRET_KEYS.includes('WEATHER_API_KEY'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/backup/secrets'`.

- [ ] **Step 3: Write minimal implementation**

Create `utils/backup/secrets.js`:

```js
// Config keys that must never appear in an export. The login password is
// process.env.PASSWORD (an env var, never stored in config.json), so the only
// secret living in config.json is the weather API key.
const SECRET_KEYS = ['WEATHER_API_KEY'];

// Return a shallow copy of a config object with secret keys removed. Pure.
const stripSecrets = (configObj) => {
  const out = { ...configObj };
  for (const key of SECRET_KEYS) delete out[key];
  return out;
};

module.exports = { SECRET_KEYS, stripSecrets };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 secrets tests green).

- [ ] **Step 5: Commit**

```bash
git add utils/backup/secrets.js test/backup.test.js
git commit -m "feat(backup): secret-stripping helper for config export"
```

---

## Task 2: Backup envelope validator

**Files:**
- Create: `utils/backup/validate.js`
- Test: `test/backup.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/backup.test.js`:

```js
const { validateBackup, SCHEMA_VERSION } = require('../utils/backup/validate');

test('validateBackup accepts a well-formed envelope', () => {
  const env = { flameBackup: true, schemaVersion: SCHEMA_VERSION, data: {} };
  assert.deepStrictEqual(validateBackup(env), { ok: true });
});

test('validateBackup rejects non-objects', () => {
  assert.strictEqual(validateBackup(null).ok, false);
  assert.strictEqual(validateBackup('nope').ok, false);
});

test('validateBackup rejects a missing flameBackup marker', () => {
  const res = validateBackup({ schemaVersion: SCHEMA_VERSION, data: {} });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /flame/i);
});

test('validateBackup rejects an unsupported schemaVersion', () => {
  const res = validateBackup({ flameBackup: true, schemaVersion: 999, data: {} });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /version/i);
});

test('validateBackup rejects a missing data object', () => {
  const res = validateBackup({ flameBackup: true, schemaVersion: SCHEMA_VERSION });
  assert.strictEqual(res.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/backup/validate'`.

- [ ] **Step 3: Write minimal implementation**

Create `utils/backup/validate.js`:

```js
const SCHEMA_VERSION = 1;

// Validate a parsed backup envelope. Pure — no I/O. Returns { ok: true } or
// { ok: false, error }.
const validateBackup = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Not a valid Flame backup file.' };
  }
  if (obj.flameBackup !== true) {
    return { ok: false, error: 'This file is not a Flame backup.' };
  }
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version (${obj.schemaVersion}). This Flame expects version ${SCHEMA_VERSION}.`,
    };
  }
  if (!obj.data || typeof obj.data !== 'object') {
    return { ok: false, error: 'Backup is missing its data section.' };
  }
  return { ok: true };
};

module.exports = { SCHEMA_VERSION, validateBackup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all secrets + validate tests green).

- [ ] **Step 5: Commit**

```bash
git add utils/backup/validate.js test/backup.test.js
git commit -m "feat(backup): envelope validator with schema versioning"
```

---

## Task 3: Serializer (build the envelope)

**Files:**
- Create: `utils/backup/serialize.js`
- Test: `test/backup.test.js` (append — structural assertions that don't need a live DB are limited, so this task is mostly verified in browser testing; add a guard test for the file-reading helper)

- [ ] **Step 1: Write the failing test**

Append to `test/backup.test.js`:

```js
const { readJsonArray } = require('../utils/backup/serialize');

test('readJsonArray returns [] when a file is missing or unparseable', () => {
  // A path that does not exist -> File.read() returns an error string -> [].
  assert.deepStrictEqual(readJsonArray('does/not/exist.json', 'themes'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/backup/serialize'`.

- [ ] **Step 3: Write minimal implementation**

Create `utils/backup/serialize.js`:

```js
const path = require('path');
const File = require('../File');
const App = require('../../models/App');
const Category = require('../../models/Category');
const Bookmark = require('../../models/Bookmark');
const loadConfig = require('../loadConfig');
const { stripSecrets } = require('./secrets');
const { SCHEMA_VERSION } = require('./validate');
const { version: appVersion } = require('../../package.json');

const CSS_PATH = path.join(__dirname, '../../public/flame.css');

// Read a `{ [key]: [...] }` JSON file and return the named array, or [] if the
// file is missing/unparseable. `File.read()` returns an error STRING (not a
// throw) on failure, so JSON.parse is wrapped.
const readJsonArray = (filePath, key) => {
  try {
    const raw = new File(filePath).read();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
};

const readCss = () => {
  try {
    const raw = new File(CSS_PATH).read();
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
};

// Build the full backup envelope from every data source. Secrets are stripped
// from config. Returns a plain object ready to JSON.stringify.
const buildBackup = async () => {
  const [apps, categories, bookmarks, config] = await Promise.all([
    App.findAll({ raw: true }),
    Category.findAll({ raw: true }),
    Bookmark.findAll({ raw: true }),
    loadConfig(),
  ]);

  return {
    flameBackup: true,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: {
      apps,
      categories,
      bookmarks,
      config: stripSecrets(config),
      themes: readJsonArray('data/themes.json', 'themes'),
      queries: readJsonArray('data/customQueries.json', 'queries'),
      customCss: readCss(),
    },
  };
};

module.exports = { buildBackup, readJsonArray };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (`readJsonArray` returns `[]` for a missing file).

- [ ] **Step 5: Commit**

```bash
git add utils/backup/serialize.js test/backup.test.js
git commit -m "feat(backup): serialize all data sources into an envelope"
```

---

## Task 4: Restorer (apply an envelope)

**Files:**
- Create: `utils/backup/restore.js`
- Test: covered by browser verification in Task 8 (DB-transaction + file writes need a live DB; no unit test here).

- [ ] **Step 1: Write the implementation**

Create `utils/backup/restore.js`:

```js
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../../db');
const App = require('../../models/App');
const Category = require('../../models/Category');
const Bookmark = require('../../models/Bookmark');
const File = require('../File');
const loadConfig = require('../loadConfig');
const { SECRET_KEYS } = require('./secrets');
const { buildBackup } = require('./serialize');

const CSS_PATH = path.join(__dirname, '../../public/flame.css');
const BACKUP_DIR = 'data/backups';

// Snapshot current state to data/backups/pre-import-<timestamp>.json so a bad
// import is recoverable. Returns the file path written.
const writeSafetyBackup = async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshot = await buildBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(BACKUP_DIR, `pre-import-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot));
  return filePath;
};

// Merge imported config over current config.json, preserving live secrets (the
// export omits them, so a naive merge would blank them out). Refresh the cache.
const restoreConfig = async (importedConfig = {}) => {
  const current = await loadConfig();
  const merged = { ...current, ...importedConfig };
  for (const key of SECRET_KEYS) merged[key] = current[key];
  new File('data/config.json').write(merged, true);
  loadConfig.setCache(merged);
};

// Replace all DB rows + file-backed sources from a validated envelope.
const applyBackup = async (envelope) => {
  const data = envelope.data || {};

  const safetyBackupPath = await writeSafetyBackup();

  // DB: wipe + recreate inside a transaction. Order matters for the FK:
  // bookmarks reference categories.
  await sequelize.transaction(async (t) => {
    await Bookmark.destroy({ where: {}, transaction: t });
    await Category.destroy({ where: {}, transaction: t });
    await App.destroy({ where: {}, transaction: t });

    if (data.categories?.length) {
      await Category.bulkCreate(data.categories, { transaction: t });
    }
    if (data.bookmarks?.length) {
      await Bookmark.bulkCreate(data.bookmarks, { transaction: t });
    }
    if (data.apps?.length) {
      await App.bulkCreate(data.apps, { transaction: t });
    }
  });

  // Files: only after a successful DB commit. If one of these throws, the
  // safety backup is the recovery path (surfaced in the controller's error).
  new File('data/themes.json').write({ themes: data.themes || [] }, true);
  new File('data/customQueries.json').write({ queries: data.queries || [] }, true);
  new File(CSS_PATH).write(typeof data.customCss === 'string' ? data.customCss : '', false);
  await restoreConfig(data.config);

  return { safetyBackupPath };
};

module.exports = { applyBackup, writeSafetyBackup, restoreConfig };
```

- [ ] **Step 2: Sanity-check it loads (no syntax errors)**

Run: `node -e "require('./utils/backup/restore.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add utils/backup/restore.js
git commit -m "feat(backup): transactional restore with pre-import safety snapshot"
```

---

## Task 5: Export & import controllers

**Files:**
- Create: `controllers/backup/exportData.js`, `controllers/backup/importData.js`, `controllers/backup/index.js`

- [ ] **Step 1: Write `exportData.js`**

Create `controllers/backup/exportData.js`:

```js
const asyncWrapper = require('../../middleware/asyncWrapper');
const { buildBackup } = require('../../utils/backup/serialize');

// @desc      Export all Flame data as a downloadable JSON backup
// @route     GET /api/backup/export
// @access    Private
const exportData = asyncWrapper(async (req, res, next) => {
  const envelope = await buildBackup();
  const date = new Date().toISOString().slice(0, 10);

  res
    .status(200)
    .setHeader('Content-Type', 'application/json')
    .setHeader(
      'Content-Disposition',
      `attachment; filename="flame-backup-${date}.json"`
    )
    .send(JSON.stringify(envelope, null, 2));
});

module.exports = exportData;
```

- [ ] **Step 2: Write `importData.js`**

Create `controllers/backup/importData.js`:

```js
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const { validateBackup } = require('../../utils/backup/validate');
const { applyBackup } = require('../../utils/backup/restore');

// @desc      Replace all Flame data from an uploaded backup JSON
// @route     POST /api/backup/import
// @access    Private
const importData = asyncWrapper(async (req, res, next) => {
  const { ok, error } = validateBackup(req.body);
  if (!ok) {
    return next(new ErrorResponse(error, 400));
  }

  const { safetyBackupPath } = await applyBackup(req.body);

  res.status(200).json({
    success: true,
    data: {
      message: 'Backup imported successfully.',
      safetyBackupPath,
    },
  });
});

module.exports = importData;
```

- [ ] **Step 3: Write `index.js`**

Create `controllers/backup/index.js`:

```js
const exportData = require('./exportData');
const importData = require('./importData');

module.exports = { exportData, importData };
```

- [ ] **Step 4: Sanity-check the controllers load**

Run: `node -e "require('./controllers/backup'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add controllers/backup
git commit -m "feat(backup): export and import controllers"
```

---

## Task 6: Route + registration

**Files:**
- Create: `routes/backup.js`
- Modify: `api.js` (the global `express.json()` at ~line 82, and the `api.use('/api/...')` block at ~line 92)

- [ ] **Step 1: Write `routes/backup.js`**

Create `routes/backup.js`:

```js
const express = require('express');
const router = express.Router();

const { auth, requireAuth } = require('../middleware');
const { exportData, importData } = require('../controllers/backup');

router.route('/export').get(auth, requireAuth, exportData);
router.route('/import').post(auth, requireAuth, importData);

module.exports = router;
```

- [ ] **Step 2: Raise the global JSON body limit in `api.js`**

A backup can exceed Express's default 100 kb JSON limit (many apps/bookmarks + CSS).
The body is parsed by the **global** `express.json()` before it reaches the route, so the
limit must be raised globally (a route-level parser would be a no-op — the global parser
already set `req._body`). In `api.js`, change line ~82:

```js
// Body parser
api.use(express.json({ limit: '10mb' }));
```

- [ ] **Step 3: Register the route in `api.js`**

In `api.js`, find the block of `api.use('/api/...')` lines (around line 92) and add after the `themes` line:

```js
api.use('/api/themes', require('./routes/themes'));
api.use('/api/backup', require('./routes/backup'));
```

- [ ] **Step 4: Sanity-check the server module loads**

Run: `node -e "require('./api.js'); console.log('ok')"`
Expected: prints `ok` (no router/require errors).

- [ ] **Step 5: Run the full server test suite**

Run: `npm test`
Expected: PASS (existing + new backup unit tests).

- [ ] **Step 6: Commit**

```bash
git add routes/backup.js api.js
git commit -m "feat(backup): /api/backup export+import routes, raise json limit"
```

---

## Task 7: Frontend — Backup & Restore UI

**Files:**
- Modify: `client/src/components/Settings/AppDetails/AppDetails.tsx`
- Modify: `client/src/components/Settings/AppDetails/AppDetails.module.css`

- [ ] **Step 1: Add the export + import handlers and UI to `AppDetails.tsx`**

`AppDetails.tsx` already imports `useState`, `Button`, `SettingsHeadline`, `applyAuth` is available at `../../../utility`, and `createNotification` is already bound. Add a `useRef` import if not present (it is, line 1).

Add these handlers inside the `AppDetails` component (e.g. just before the `return`):

```tsx
const fileInputRef = useRef<HTMLInputElement>(null);
const [importing, setImporting] = useState(false);

const handleExport = async () => {
  try {
    const res = await fetch('/api/backup/export', { headers: applyAuth() });
    if (!res.ok) throw new Error('export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flame-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    createNotification({ title: 'Error', message: 'Failed to export backup.' });
  }
};

const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // allow re-selecting the same file later
  if (!file) return;

  let envelope: unknown;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    createNotification({ title: 'Error', message: 'That file is not valid JSON.' });
    return;
  }

  const confirmed = window.confirm(
    'Importing will REPLACE all current apps, bookmarks, categories, themes, ' +
      'queries, and custom CSS with the contents of this file. A safety backup ' +
      'of your current data will be saved first. Continue?'
  );
  if (!confirmed) return;

  setImporting(true);
  try {
    const res = await fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...applyAuth() },
      body: JSON.stringify(envelope),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Import failed.');
    }
    createNotification({
      title: 'Success',
      message: 'Backup imported. Reloading…',
    });
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    createNotification({
      title: 'Error',
      message: err instanceof Error ? err.message : 'Import failed.',
    });
    setImporting(false);
  }
};
```

Add `ChangeEvent` to the existing `react` import at the top if not already imported (it is — line 1 imports `ChangeEvent`).

Then add the UI section inside the `isAuthenticated` `<Fragment>`, after the closing `</form>` (around line 282, before the closing `</Fragment>`):

```tsx
<hr className={classes.separator} />
<SettingsHeadline text="Backup & Restore" />
<p className={classes.text}>
  Export all apps, bookmarks, categories, settings, themes, queries, and custom
  CSS to a single JSON file, or restore from a previous export. Secrets (weather
  API key) are excluded from exports. Importing replaces all current data.
</p>
<div className={classes.backupButtons}>
  <Button type="button" onClick={handleExport}>
    Export backup
  </Button>
  <Button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    disabled={importing}
  >
    {importing ? 'Importing…' : 'Import backup'}
  </Button>
  <input
    ref={fileInputRef}
    type="file"
    accept="application/json,.json"
    style={{ display: 'none' }}
    onChange={handleImportFile}
  />
</div>
```

Add the `applyAuth` import: in the existing utility import line (`import { checkVersion, VersionStatus } from '../../../utility';`), extend it to:

```tsx
import { checkVersion, VersionStatus, applyAuth } from '../../../utility';
```

- [ ] **Step 2: Add the button-row style**

Append to `client/src/components/Settings/AppDetails/AppDetails.module.css`:

```css
.backupButtons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
```

- [ ] **Step 3: Verify `applyAuth` is exported from the utility barrel**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('client/src/utility/index.ts','utf8');console.log(s.includes('applyAuth'))"`
Expected: prints `true`. If `false`, add `export * from './applyAuth';` to `client/src/utility/index.ts`.

- [ ] **Step 4: Build the client**

Run: `cd client && npm run build`
Expected: build succeeds with no TypeScript errors. (Return to repo root afterward: `cd ..`.)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Settings/AppDetails/AppDetails.tsx client/src/components/Settings/AppDetails/AppDetails.module.css client/src/utility/index.ts
git commit -m "feat(backup): Backup & Restore UI in system settings"
```

---

## Task 8: Browser verification (end-to-end)

**Files:** none (manual/preview verification).

- [ ] **Step 1: Start the app and log in**

Use the `preview_start` workflow (or `npm start` + the dev client). Log into Settings as admin so `isAuthenticated` is true.

- [ ] **Step 2: Verify export**

In Settings → App/System tab, click **Export backup**. Confirm a `flame-backup-<date>.json` downloads. Open it and verify:
- Top-level `flameBackup: true`, `schemaVersion: 1`, `exportedAt`, `appVersion`.
- `data.apps`, `data.categories`, `data.bookmarks`, `data.config`, `data.themes`, `data.queries`, `data.customCss` present.
- `data.config.WEATHER_API_KEY` is **absent**.

- [ ] **Step 3: Verify import (replace + safety backup)**

Add a throwaway app via the UI. Then **Import backup** the file from Step 2, confirm the dialog. After the reload:
- The throwaway app is gone (data replaced by the file's contents).
- A `data/backups/pre-import-<timestamp>.json` file now exists on the server.

- [ ] **Step 4: Verify rejection of a bad file**

Create a `not-a-backup.json` containing `{"foo":1}` and import it. Expect an error notification ("not a Flame backup") and **no** data change.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix(backup): verification adjustments"
```

(If no fixes were needed, skip.)

---

## Done criteria
- `npm test` green (secrets + validate + serialize unit tests).
- `cd client && npm run build` green.
- Export downloads a secret-free envelope; import replaces data and writes a safety snapshot; bad files rejected with a clear message.
- All work committed on `feat/backup-import-export`.
