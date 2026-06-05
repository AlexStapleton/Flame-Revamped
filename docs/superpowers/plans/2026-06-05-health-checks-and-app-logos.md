# Health Checks (A1) + App-Logo Icons (A3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) to
> implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Add opt-in server-side up/down health-check dots per app (authed-only) and
`dashboard:<slug>` CDN service logos for app/bookmark cards.

**Architecture:** Status stored on the `apps` row, computed by a 60s `node-schedule` job
(reachable = any HTTP response), returned via `GET /api/apps` and stripped for guests; a
periodic authed client refresh keeps dots current. Logos resolve a `dashboard:<slug>` icon
value to the dashboard-icons jsDelivr CDN in the shared card components.

**Tech Stack:** Node/Express/Sequelize/SQLite, umzug migrations, node:test; React/Redux/Vite.

---

## File structure
- **Backend:** `models/App.js` (+cols), `db/migrations/07_app-status.js` (new),
  `utils/checkAppStatus.js` (new, testable), `utils/runStatusChecks.js` (new),
  `utils/jobs.js` (schedule), `controllers/apps/getAllApps.js` (strip for guests),
  `utils/init/initialConfig.json` (+`statusCheckInterval`), `test/checkAppStatus.test.js` (new).
- **Frontend:** `interfaces/App.ts`, `interfaces/Config.ts`,
  `utility/templateObjects/appTemplate.ts`, `utility/iconSource.ts` (new),
  `components/Apps/AppForm/AppForm.tsx`, `components/Apps/AppCard/AppCard.tsx` (+module css),
  `components/Bookmarks/BookmarkCard/BookmarkCard.tsx`, plus a `useStatusRefresh` in the
  apps/home view.

---

### Task 1: App model + migration (status columns)

**Files:** Modify `models/App.js`; Create `db/migrations/07_app-status.js`

- [ ] **Step 1:** Add columns to `models/App.js` inside the `define` attributes (after `description`):
```js
    statusCheckEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    statusCheckUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    statusCheckedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
```

- [ ] **Step 2:** Create `db/migrations/07_app-status.js`:
```js
const { DataTypes } = require('sequelize');
const { BOOLEAN, STRING, DATE } = DataTypes;

const up = async (query) => {
  await query.addColumn('apps', 'statusCheckEnabled', { type: BOOLEAN, defaultValue: false });
  await query.addColumn('apps', 'statusCheckUrl', { type: STRING, allowNull: true, defaultValue: null });
  await query.addColumn('apps', 'status', { type: STRING, allowNull: true, defaultValue: null });
  await query.addColumn('apps', 'statusCheckedAt', { type: DATE, allowNull: true, defaultValue: null });
};

const down = async (query) => {
  await query.removeColumn('apps', 'statusCheckEnabled');
  await query.removeColumn('apps', 'statusCheckUrl');
  await query.removeColumn('apps', 'status');
  await query.removeColumn('apps', 'statusCheckedAt');
};

module.exports = { up, down };
```

- [ ] **Step 3:** `node --check models/App.js db/migrations/07_app-status.js` → OK.
- [ ] **Step 4:** Commit: `git add models/App.js db/migrations/07_app-status.js && git commit -m "feat(status): add app status columns + migration"`

---

### Task 2: Status-mapping helper (TDD)

**Files:** Create `utils/checkAppStatus.js`, `test/checkAppStatus.test.js`

- [ ] **Step 1:** Write failing test `test/checkAppStatus.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { mapResult } = require('../utils/checkAppStatus');

test('any HTTP response (incl. 401/403/500) => online', () => {
  assert.strictEqual(mapResult({ ok: true, statusCode: 200 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 401 }), 'online');
  assert.strictEqual(mapResult({ ok: true, statusCode: 503 }), 'online');
});

test('a thrown request (timeout/refused/DNS) => offline', () => {
  assert.strictEqual(mapResult({ ok: false }), 'offline');
});
```

- [ ] **Step 2:** Run `node --test "test/checkAppStatus.test.js"` → FAIL (module not found).

- [ ] **Step 3:** Implement `utils/checkAppStatus.js`:
```js
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
```

- [ ] **Step 4:** Run `node --test "test/checkAppStatus.test.js"` → PASS (2 tests).
- [ ] **Step 5:** Commit: `git add utils/checkAppStatus.js test/checkAppStatus.test.js && git commit -m "feat(status): add unit-tested status-mapping helper"`

---

### Task 3: Status-check runner + schedule

**Files:** Create `utils/runStatusChecks.js`; Modify `utils/jobs.js`

- [ ] **Step 1:** Create `utils/runStatusChecks.js`:
```js
const App = require('../models/App');
const { checkAppStatus } = require('./checkAppStatus');

// Probe every opt-in app and persist online/offline. Never throws.
const runStatusChecks = async () => {
  const apps = await App.findAll({ where: { statusCheckEnabled: true } });
  await Promise.all(
    apps.map(async (app) => {
      try {
        const status = await checkAppStatus(app.statusCheckUrl || app.url);
        await app.update({ status, statusCheckedAt: new Date() });
      } catch (_) {
        /* per-app failure must not break the batch */
      }
    })
  );
};

module.exports = runStatusChecks;
```

- [ ] **Step 2:** In `utils/jobs.js`, require it at top: `const runStatusChecks = require('./runStatusChecks');` and add inside the exported function (after the syncApps job), a self-rescheduling timer so the interval is config-driven:
```js
  // App health checks every statusCheckInterval seconds (config, default 60).
  const { statusCheckInterval } = await loadConfig();
  const intervalMs = Math.max(15, Number(statusCheckInterval) || 60) * 1000;
  const tick = async () => {
    try { await runStatusChecks(); }
    catch (err) { logger.log(`Status checks failed: ${err.message}`, 'ERROR'); }
  };
  setInterval(tick, intervalMs);
  tick(); // run once at startup
```

- [ ] **Step 3:** `node --check utils/runStatusChecks.js utils/jobs.js` → OK.
- [ ] **Step 4:** Commit: `git add utils/runStatusChecks.js utils/jobs.js && git commit -m "feat(status): schedule periodic health checks"`

---

### Task 4: Strip status from guest API responses

**Files:** Modify `controllers/apps/getAllApps.js`

- [ ] **Step 1:** After `const apps = await App.findAll({ order, where });`, before the response, add guest stripping:
```js
  // Status fields are admin-only — never expose infra health to guests.
  const data = req.isAuthenticated
    ? apps
    : apps.map((a) => {
        const o = a.get({ plain: true });
        delete o.status;
        delete o.statusCheckedAt;
        delete o.statusCheckEnabled;
        delete o.statusCheckUrl;
        return o;
      });
```
Then return `data` instead of `apps` in both the production and non-production `res.json` blocks (`data: data`).

- [ ] **Step 2:** `node --check controllers/apps/getAllApps.js` → OK.
- [ ] **Step 3:** Commit: `git add controllers/apps/getAllApps.js && git commit -m "feat(status): hide status from unauthenticated responses"`

---

### Task 5: Config — statusCheckInterval

**Files:** Modify `utils/init/initialConfig.json`, `client/src/interfaces/Config.ts`

- [ ] **Step 1:** Add to `initialConfig.json` (after `showPopups`): `"statusCheckInterval": 60`
- [ ] **Step 2:** Add to `Config.ts` interface: `statusCheckInterval: number;`
- [ ] **Step 3:** Commit: `git add utils/init/initialConfig.json client/src/interfaces/Config.ts && git commit -m "feat(status): add statusCheckInterval config"`

---

### Task 6: Frontend App interface + template

**Files:** Modify `client/src/interfaces/App.ts`, `client/src/utility/templateObjects/appTemplate.ts`

- [ ] **Step 1:** In `App.ts`, extend `NewApp` with the editable fields and `App` with read-only status:
```ts
export interface NewApp {
  name: string;
  url: string;
  icon: string;
  isPublic: boolean;
  description: string;
  statusCheckEnabled: boolean;
  statusCheckUrl: string;
}

export interface App extends Model, NewApp {
  orderId: number;
  isPinned: boolean;
  status?: 'online' | 'offline' | null;
  statusCheckedAt?: string | null;
}
```

- [ ] **Step 2:** In `appTemplate.ts`, add `statusCheckEnabled: false,` and `statusCheckUrl: '',` to `newAppTemplate` (read the file first; keep existing fields).
- [ ] **Step 3:** Commit: `git add client/src/interfaces/App.ts client/src/utility/templateObjects/appTemplate.ts && git commit -m "feat(status): frontend app types + template"`

---

### Task 7: AppForm — health-check toggle + status URL + FormData

**Files:** Modify `client/src/components/Apps/AppForm/AppForm.tsx`

- [ ] **Step 1:** In `createFormData()`, append the new fields so the upload path persists them:
```js
      data.append('statusCheckEnabled', `${formData.statusCheckEnabled ? 1 : 0}`);
      data.append('statusCheckUrl', formData.statusCheckUrl || '');
```

- [ ] **Step 2:** Update the MDI icon hint `<span>` text to mention logos:
  `Use an MDI name, an image URL, or `dashboard:<name>` for an app logo (e.g. dashboard:plex).`

- [ ] **Step 3:** Before the VISIBILITY `InputGroup`, add the health-check controls:
```jsx
      {/* HEALTH CHECK */}
      <InputGroup>
        <label htmlFor="statusCheckEnabled">Health check</label>
        <select
          id="statusCheckEnabled"
          name="statusCheckEnabled"
          value={formData.statusCheckEnabled ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={0}>Disabled</option>
          <option value={1}>Enabled (show up/down status)</option>
        </select>
      </InputGroup>

      {formData.statusCheckEnabled && (
        <InputGroup>
          <label htmlFor="statusCheckUrl">Status URL (optional)</label>
          <input
            type="text"
            name="statusCheckUrl"
            id="statusCheckUrl"
            placeholder="Defaults to the app URL"
            value={formData.statusCheckUrl}
            onChange={(e) => inputChangeHandler(e)}
          />
        </InputGroup>
      )}
```

- [ ] **Step 4:** Build check: `cd client && npm run build` → exit 0.
- [ ] **Step 5:** Commit: `git add client/src/components/Apps/AppForm/AppForm.tsx && git commit -m "feat(status): app form health-check controls"`

---

### Task 8: Icon source helper + dashboard:<slug> in cards

**Files:** Create `client/src/utility/iconSource.ts`; Modify `AppCard.tsx`, `BookmarkCard.tsx`

- [ ] **Step 1:** Create `client/src/utility/iconSource.ts`:
```ts
// `dashboard:<slug>` -> dashboard-icons CDN logo (svg). Returns null otherwise.
export const dashboardIconUrl = (icon: string): string | null => {
  const m = /^dashboard:([a-z0-9._-]+)$/i.exec((icon || '').trim());
  return m
    ? `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${m[1].toLowerCase()}.svg`
    : null;
};
```
Export it from `client/src/utility/index.ts` (add `export * from './iconSource';`).

- [ ] **Step 2:** In `AppCard.tsx`, import `dashboardIconUrl` and add a branch at the top of the icon resolution (before `isImage`):
```jsx
  const dashUrl = dashboardIconUrl(icon);
  if (dashUrl) {
    iconEl = (
      <img src={dashUrl} alt={`${app.name} logo`} className={classes.CustomIcon} draggable={false} />
    );
  } else if (isImage(icon)) {
    /* existing */
```
(Restructure the existing `if/else if` chain so `dashUrl` is checked first.)

- [ ] **Step 3:** Mirror the same branch in `BookmarkCard.tsx`'s icon resolution.
- [ ] **Step 4:** Build: `cd client && npm run build` → exit 0.
- [ ] **Step 5:** Commit: `git add client/src/utility/iconSource.ts client/src/utility/index.ts client/src/components/Apps/AppCard/AppCard.tsx client/src/components/Bookmarks/BookmarkCard/BookmarkCard.tsx && git commit -m "feat(logos): dashboard:<slug> CDN icons"`

---

### Task 9: Status dot on AppCard

**Files:** Modify `AppCard.tsx`, `AppCard.module.css`

- [ ] **Step 1:** In `AppCard.tsx`, render a dot when `app.status` is present (inside the `<a>`, e.g. wrapping the icon area):
```jsx
      {app.status && (
        <span
          className={`${classes.StatusDot} ${app.status === 'online' ? classes.online : classes.offline}`}
          title={`Status: ${app.status}`}
        />
      )}
```

- [ ] **Step 2:** Add CSS to `AppCard.module.css`:
```css
.StatusDot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; }
.online { background: #43a047; }
.offline { background: #e53935; }
```
Ensure `.AppCard` is `position: relative;` (add if missing).

- [ ] **Step 3:** Build: `cd client && npm run build` → exit 0.
- [ ] **Step 4:** Commit: `git add client/src/components/Apps/AppCard/AppCard.tsx client/src/components/Apps/AppCard/AppCard.module.css && git commit -m "feat(status): status dot on app cards"`

---

### Task 10: Authed live refresh of app status

**Files:** Modify `client/src/components/Home/Home.tsx` (and/or `Apps.tsx`)

- [ ] **Step 1:** Add an effect that, when `isAuthenticated`, dispatches `getApps()` every 60s and clears on unmount:
```jsx
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = window.setInterval(() => getApps(), 60000);
    return () => window.clearInterval(id);
  }, [isAuthenticated]);
```
(Use the existing `getApps` action binding; add it if not already bound in the component.)

- [ ] **Step 2:** Build: `cd client && npm run build` → exit 0.
- [ ] **Step 3:** Commit.

---

### Task 11: Verify, ship

- [ ] `npm test` (root) → status helper + existing tests green.
- [ ] Boot server (PASSWORD set), confirm migration `07_app-status` applies; `cd client && npm run build` deploy to `public/`.
- [ ] Browser (Chromium preview): (a) app icon `dashboard:plex` renders the CDN logo `<img>`; (b) an app with health check on + a bad URL → red dot, a good URL → green; (c) unauthenticated `GET /api/apps` returns no `status` fields.
- [ ] Update `docs/ARCHITECTURE_AND_DEPENDENCIES.md` (features list) + audit doc SSRF note (status checks fetch admin URLs).
- [ ] Merge to `main`, tag `v1.4.0`, multi-arch publish, verify `:latest`.

---

## Self-review
- **Spec coverage:** model+migration (T1), check job/helper (T2,T3), guest stripping (T4),
  config (T5), interface/template (T6), form toggle+URL+FormData (T7), `dashboard:` logos
  in both cards (T8), status dot (T9), live refresh (T10), testing/ship (T11). ✅ all spec
  sections mapped.
- **Placeholders:** none — code shown for each non-trivial step.
- **Type consistency:** `status`/`statusCheckEnabled`/`statusCheckUrl`/`statusCheckedAt`
  used identically across model, migration, API, interface, template, form. `mapResult`
  / `checkAppStatus` / `dashboardIconUrl` names consistent across tasks.
