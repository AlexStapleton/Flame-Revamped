# Design — App Health Checks (A1) + App-Logo Icons (A3)

**Date:** 2026-06-05
**Status:** Approved (design); pending spec review
**Scope:** Two additive features for Flame, shipped together as one release.

---

## 1. Overview & goals

Make the link grid feel "alive" without turning Flame into a monitoring/widget
dashboard:

- **A1 — Health checks:** an opt-in, server-side up/down indicator per app, shown as
  a small status dot on the card (authenticated users only).
- **A3 — App-logo icons:** let users use real service logos (Plex, Sonarr, …) from the
  `dashboard-icons` CDN via a `dashboard:<slug>` icon value, alongside the existing
  MDI / uploaded / URL icon options.

### Non-goals (explicitly out of scope)
Visual/searchable icon picker; vendored offline icon set; status history/graphs;
WebSocket-pushed status; per-app check intervals; down-notifications; health checks for
bookmarks. All are clean future add-ons.

---

## 2. A1 — Health checks

### 2.1 Data model
New columns on the `apps` table (Sequelize model `models/App.js` + migration
`db/migrations/07_app-status.js`):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `statusCheckEnabled` | BOOLEAN/TINYINT | `false` | Opt-in toggle (per app) |
| `statusCheckUrl` | STRING | `null` | Optional override; falls back to `url` |
| `status` | STRING | `null` | `'online'` \| `'offline'` \| `null` (unknown) |
| `statusCheckedAt` | DATE | `null` | Timestamp of the last check |

### 2.2 Backend job
A new scheduled job in `utils/jobs.js` (same `node-schedule` pattern as weather/app-sync):

- Runs every `statusCheckInterval` seconds (config, default **60**).
- Selects apps where `statusCheckEnabled = true`.
- For each, performs a server-side request to `statusCheckUrl || url`:
  - `axios` with `timeout: 5000`, `validateStatus: () => true`, method **HEAD**, falling
    back to **GET** if HEAD errors or returns 405.
  - **`online`** = any HTTP response received (covers auth-gated apps that return
    401/403 — reachable ≠ authorized).
  - **`offline`** = network error / timeout / DNS failure.
  - Update the row's `status` and `statusCheckedAt`.
- Checks run with bounded concurrency (e.g. `Promise.all` over the enabled set — the set
  is small for a startpage) and never throw out of the job (each check is try/caught).
- One immediate run at startup so dots populate without waiting a full interval.

> **Security note:** the server fetches admin-configured URLs — the same SSRF surface as
> the existing weather and Docker integrations. Apps are admin-created behind auth, so
> this is acceptable and consistent with current behavior. Documented in the audit doc.

### 2.3 API & visibility
- `GET /api/apps` already returns the apps. Status fields are **admin-only**: when
  `req.isAuthenticated` is false, `getAllApps` strips `status`, `statusCheckedAt`,
  `statusCheckEnabled`, and `statusCheckUrl` from each returned app (guests never see
  infra health). Authenticated responses include them.
- Create/update (`createApp`/`updateApp`) already spread `req.body`; Sequelize will accept
  the new attributes. No new endpoints.

### 2.4 Config
- Add `statusCheckInterval` (number, seconds, default `60`) to
  `utils/init/initialConfig.json` and the client `Config` interface, so the cadence is
  tunable from settings (consistent with how Flame exposes other options). The job reads
  it via the cached `loadConfig`.

### 2.5 Frontend
- `interfaces/App.ts`: add `status?`, `statusCheckEnabled?`, `statusCheckUrl?`,
  `statusCheckedAt?`.
- `AppCard.tsx`: render a small status dot (CSS) when `status` is present —
  green = `online`, red = `offline`, nothing when `null`/absent. Only authenticated
  responses carry `status`, so the dot is implicitly authed-only.
- `AppForm.tsx`: a **"Health check"** toggle (`statusCheckEnabled`) and, when enabled, an
  optional **"Status URL"** field (`statusCheckUrl`, placeholder = "defaults to the app
  URL").
- **Live refresh:** while authenticated and on the home/apps view, re-fetch apps every
  ~60s (a `setInterval` that dispatches `getApps`, cleared on unmount) so dots stay
  current. Unauthenticated visitors don't poll.

---

## 3. A3 — App-logo icons (CDN by slug)

### 3.1 Resolution convention
An icon value of the form `dashboard:<slug>` (e.g. `dashboard:plex`) resolves to:

```
https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/<slug>.svg
```

and renders as an `<img>`. All existing icon kinds are unchanged:
MDI name → `Icon`/`iconParser`; uploaded filename → `/uploads/...`; `http(s)://...` URL →
`<img>`; SVG → existing SVG path.

### 3.2 Where
Add a tiny shared helper (e.g. `utility/iconSource.ts`): `isDashboardIcon(icon)` and
`dashboardIconUrl(icon)`. Wire it into the icon branch of **both** `AppCard.tsx` and
`BookmarkCard.tsx` so logos work for apps and bookmarks. The check runs **before** the
MDI/image/SVG branches.

### 3.3 UX
`AppForm` and `BookmarkForm` icon-field hint/placeholder updated to document the options,
including `dashboard:<name>` for service logos. No picker UI in this MVP.

### 3.4 Offline behavior
CDN-based → requires internet (like weather and the version check). If offline, the `<img>`
simply fails to load; MDI and uploaded icons remain fully offline. Acceptable and
documented.

---

## 4. Testing & verification
- **Server unit tests** (`node:test`): the status-evaluation logic — a helper that maps an
  axios result/error to `online`/`offline` — extracted so it's unit-testable without
  network (mock "response received" vs "threw"). Add to `test/`.
- **Build:** `vite build` + `npm test` green.
- **Browser verification** (Chromium preview, as used this session):
  - An app with `dashboard:plex` renders the real logo `<img>` (src = CDN URL).
  - An app with health check enabled gets a status dot; an unreachable URL → red,
    a reachable one → green.
  - Unauthenticated `GET /api/apps` response contains **no** `status` fields.
- **Migration:** boots and applies `07_app-status` cleanly; existing apps default to
  `statusCheckEnabled = false`, `status = null` (no dots until enabled).

## 5. Files touched (summary)
**Backend:** `models/App.js`, `db/migrations/07_app-status.js`, `utils/jobs.js`,
`utils/checkAppStatus.js` (new — the per-app check + status mapping),
`controllers/apps/getAllApps.js` (strip fields for guests),
`utils/init/initialConfig.json`, `test/checkAppStatus.test.js` (new).
**Frontend:** `interfaces/App.ts`, `interfaces/Config.ts`,
`components/Apps/AppCard/AppCard.tsx` (+ css), `components/Apps/AppForm/AppForm.tsx`,
`components/Bookmarks/BookmarkCard/BookmarkCard.tsx`, `utility/iconSource.ts` (new),
home/apps live-refresh, relevant form templates/interfaces.

## 6. Rollout
One feature branch → PR → merge → tag `v1.4.0` (minor: new user-facing features) →
multi-arch publish, per the established flow.
