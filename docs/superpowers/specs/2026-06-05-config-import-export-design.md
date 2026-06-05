# Design — A2: Config/data Import & Export

**Date:** 2026-06-05
**Status:** Approved (design); pending spec review
**Scope:** One additive feature for Flame — one-click backup (export) and restore
(import) of all user-created data and settings, with a button in Settings.

---

## 1. Overview & goals

Give Flame first-class **portability, migration, and backup** support: a single
authenticated Export that serializes everything a user has configured into one JSON
file, and an Import that restores it. High value, low risk; complements the existing
DB auto-backup-on-boot (which is invisible to the user and not portable).

### Non-goals (explicitly out of scope)
Scheduled/automated exports; cloud/remote backup targets; selective (per-table) import;
merge/dedupe import; encryption of the export file; migrating between major schema
versions (rejected, not auto-migrated, in this MVP); backup of cached weather data.

---

## 2. Data sources

| Piece | Storage | Notes |
|-------|---------|-------|
| apps | `apps` table (Sequelize) | full rows |
| categories | `categories` table | parent of bookmarks (`hasMany`) |
| bookmarks | `bookmarks` table | `categoryId` FK → category |
| config | `config` table (key/value/valueType/isLocked) | **secrets stripped** on export |
| themes | `data/themes.json` (`{ themes: [...] }`) | file-backed |
| queries | `data/customQueries.json` (`{ queries: [...] }`) | file-backed |
| custom CSS | `public/flame.css` | raw text |

Weather data (`weather` table) is cached external data and is **excluded**.

### Secret config keys (stripped from export)
`WEATHER_API_KEY`, `password` (and any future auth secret). These keys are removed from
the exported `config` array so the file is safe to store/share. The exact denylist lives
in one place (`utils/backup/secrets.js`) so it is easy to audit and extend.

---

## 3. Backend

### 3.1 Routes
New resource `routes/backup.js`, mounted at `/api/backup` alongside the other routers.
Both endpoints use the existing `auth` + `requireAuth` middleware (admin-only):

- **`GET /api/backup/export`** — builds the envelope, sends it as a downloadable JSON
  (`Content-Disposition: attachment; filename="flame-backup-<date>.json"`).
- **`POST /api/backup/import`** — accepts the envelope in the request body, validates it,
  writes a safety backup, then replaces current data.

Controllers live in `controllers/backup/` (`exportData.js`, `importData.js`, `index.js`)
following the existing per-controller-folder pattern.

### 3.2 Shared serializer / restorer
- `utils/backup/serialize.js` — `buildBackup()` reads all sources and returns the
  envelope object. Reused by both the export endpoint **and** the pre-import safety
  snapshot.
- `utils/backup/restore.js` — `applyBackup(envelope)` performs the replace (section 3.4).
- `utils/backup/validate.js` — `validateBackup(obj)` returns `{ ok, error }`; pure and
  unit-testable.
- `utils/backup/secrets.js` — the secret-key denylist + a `stripSecrets(configRows)` helper.

### 3.3 Envelope format
Versioned for forward-compatibility:

```json
{
  "flameBackup": true,
  "schemaVersion": 1,
  "exportedAt": "2026-06-05T12:00:00Z",
  "appVersion": "1.4.2",
  "data": {
    "apps": [ ... ],
    "categories": [ ... ],
    "bookmarks": [ ... ],
    "config": [ { "key": "...", "value": "...", "valueType": "...", "isLocked": 0 } ],
    "themes": [ ... ],
    "queries": [ ... ],
    "customCss": "..."
  }
}
```

`appVersion` comes from `package.json` (informational only — not used for gating).

### 3.4 Import semantics — replace + safety backup
1. **Validate** the envelope (`validateBackup`): require `flameBackup === true` and a
   supported `schemaVersion` (currently `1`). On failure respond `400` and make **no**
   changes.
2. **Safety backup**: call `buildBackup()` for the *current* state and write it to
   `data/backups/pre-import-<ISO-timestamp>.json`. This is the recovery path.
3. **DB writes in a single Sequelize transaction**:
   - `destroy` all bookmarks, then categories, then apps.
   - `bulkCreate` categories → bookmarks (preserving `categoryId`) → apps from the envelope.
   - **config**: **upsert** each provided key (by `key`). Existing secret/locked keys
     (`WEATHER_API_KEY`, `password`) are **left untouched** — a stripped export therefore
     never wipes live secrets. No config rows are deleted.
4. **File writes after the DB transaction commits**: overwrite `data/themes.json`,
   `data/customQueries.json`, and `public/flame.css` from the envelope.
   - The DB transaction rolls back on any DB error. File writes happen only after a
     successful commit; if a file write then fails, the pre-import snapshot from step 2
     allows manual recovery (documented in the response/error message).

> **Security note:** import is admin-only (`requireAuth`) and overwrites server-side data
> — same trust level as the existing config/theme write endpoints. Secrets are never
> emitted by export and never deleted by import. Consistent with current behavior.

### 3.5 ID handling
Apps/categories/bookmarks are recreated with their original `id`s preserved (so
`categoryId` links stay valid) inside the transaction after the tables are cleared. This
is a full restore, not a merge, so primary-key reuse is safe.

---

## 4. Frontend

A new **"Backup & Restore"** section appended to
`components/Settings/AppDetails/AppDetails.tsx` (already rendered only when
`isAuthenticated`):

- **Export** button → `fetch('/api/backup/export')` with the auth token header → read the
  response as a blob → trigger a browser download named `flame-backup-YYYY-MM-DD.json`.
  (Uses `fetch` rather than a plain `<a download>` so the `Authorization` header is sent.)
- **Import** → hidden file `<input>` → on file select, parse JSON client-side for a quick
  sanity check → show a **confirmation dialog warning that import replaces all current
  apps, bookmarks, categories, themes, queries, and CSS** → on confirm, `POST` the parsed
  envelope to `/api/backup/import` → on success show a notification and **reload the page**
  so all stores (apps, bookmarks, categories, themes, config, CSS) re-fetch cleanly.
- Errors (invalid file, `400` from server) surface via the existing `createNotification`.

No new Settings tab; no Redux store changes required (export/import are one-shot fetches).

---

## 5. Testing & verification

- **Server unit tests** (`node:test`, matching existing `test/` style):
  - `validateBackup` — accepts a good envelope; rejects missing `flameBackup`, wrong
    `schemaVersion`, and non-object input.
  - `stripSecrets` — removes `WEATHER_API_KEY`/`password` and leaves other keys intact.
  - (Serializer shape asserted where it can run without a live DB; DB-dependent paths
    covered by the browser verification below.)
- **Build:** `vite build` + `npm test` green.
- **Browser verification** (Chromium preview):
  - Export downloads a JSON file with the envelope shape and **no** secret config keys.
  - Modify the instance (add an app), Import a prior export, confirm the instance is
    restored to the file's contents and a `pre-import-*.json` safety file was written.
  - A non-Flame / wrong-`schemaVersion` JSON is rejected with a clear notification and no
    data change.

---

## 6. Files touched (summary)

**Backend (new):** `routes/backup.js`, `controllers/backup/{exportData,importData,index}.js`,
`utils/backup/{serialize,restore,validate,secrets}.js`,
`test/backup.test.js`.
**Backend (edit):** the main route-mount file (register `/api/backup`).
**Frontend (edit):** `components/Settings/AppDetails/AppDetails.tsx` (+ its CSS module for
the new section).

---

## 7. Rollout

One feature branch (`feat/backup-import-export`) → PR → merge → tag `v1.5.0` (minor: new
user-facing feature) → multi-arch publish, per the established flow.
