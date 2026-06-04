# Flame — Architecture & Performance Review + Action Plan

**Date:** 2026-06-03
**Scope:** Backend (Node/Express/Sequelize/SQLite) and Frontend (React/Redux/Vite).
**Companion doc:** [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (security findings — already remediated; not repeated here).

> **UPDATE 2026-06-03: All items below (A1–A3, B1–B4, C1–C6) are now IMPLEMENTED**
> on branch `perf/architecture-cleanup`. See the ✅ notes inline for what changed.

> Bottom line: the app is functionally solid and the security posture is now good.
> The remaining issues are **architectural smells, per-request waste, and a few latent
> bugs** — none are showstoppers, but several are cheap, high-leverage wins for a
> read-heavy startpage that gets hit on every browser/new-tab open.

---

## Implementation summary (2026-06-03)

| ID | Change | Files |
|----|--------|-------|
| A1 | Docker/K8s sync moved off `GET /api/apps` to a 1-min scheduled job + startup run + authed `POST /api/apps/sync`; unpin batched into one UPDATE | `utils/jobs.js`, `utils/syncApps.js`, `controllers/apps/{getAllApps,syncApps}.js`, `controllers/apps/docker/*`, `routes/apps.js` |
| A2 | `loadConfig()` caches parsed config in memory, returns copies, refreshes on write, drops cache on file change | `utils/loadConfig.js`, `controllers/config/updateConfig.js` |
| A3 | `compression` middleware added | `api.js`, `package.json` |
| B1 | Removed dead `axios.defaults` line (ReferenceError on token expiry) | `client/src/App.tsx` |
| B2 | Dropped dead `apps` param from `useDocker`/`useKubernetes` | `controllers/apps/docker/*` |
| B3 | Per-client send guard + ping/pong heartbeat | `Socket.js` |
| B4 | Documented `config.json` as the single runtime source (the `config` table is migration-only) | `utils/loadConfig.js` |
| C1 | Index on `bookmarks.categoryId` | `db/migrations/06_indexes.js` |
| C2 | Weather row updated in place instead of inserting every 15 min | `utils/getExternalWeather.js` |
| C3 | Token-check interval 1s → 30s | `client/src/App.tsx` |
| C4 | Removed unreachable `return null` | `client/src/utility/checkVersion.ts` |
| C5 | Long cache for hashed `/assets`, `no-cache` for html/css/json | `api.js` |
| C6 | `console.warn` → project `Logger` | `controllers/categories/getAllCategories.js` |

---

## How the system fits together

```
Browser ──HTTP──► Express (api.js) ──► routes/* ──► controllers/* ──► Sequelize ──► SQLite (data/db.sqlite)
   │                                         │
   │                                         └──► loadConfig() ──► reads data/config.json (every request)
   │
   └──WebSocket(/socket)──► Socket.js ◄── node-schedule job (every 15 min) ──► weatherapi.com
```

- **Config has two homes:** a `config` table in SQLite *and* `data/config.json`. The
  controllers read the JSON file via `loadConfig()`; writes go through `updateConfig`.
  This dual source-of-truth is the root of several issues below.
- **Reads are public** (filtered by `isPublic`); a single `PASSWORD` gates writes.
- **Weather** is pushed to clients over a WebSocket and refreshed by a cron job.

---

## 🔴 HIGH-VALUE — fix first

### A1 — Docker integration runs (and writes to the DB) on every public `GET /api/apps`
**Files:** [`controllers/apps/getAllApps.js`](../controllers/apps/getAllApps.js),
[`controllers/apps/docker/useDocker.js`](../controllers/apps/docker/useDocker.js)

When `dockerApps`/`kubernetesApps` is enabled, **every unauthenticated page load**
triggers `useDocker()`, which:
1. opens a socket/HTTP round-trip to the Docker API,
2. `App.findAll()`,
3. if `unpinStoppedApps` is set, **`await app.update()` in a loop over every app**, then
4. **create/update every matched container** — again one `await` per app inside a `for` loop.

So a read endpoint that a browser hits on every new tab performs N+1 serialized DB
**writes** plus an external API call. Under any concurrency this serializes writes against
SQLite's single writer and can visibly stall the homepage.

**Action:**
- Move container syncing **out of the request path**. Run it on a schedule
  (`node-schedule`, like the weather job) and/or on an explicit authenticated
  `POST /api/apps/sync`. `GET /api/apps` should be a pure read.
- If it must stay request-driven, debounce/cache it (e.g. run at most once per N seconds)
  and batch the writes (`bulkCreate` + a single `update ... where isPinned`).
- Collapse the `unpinStoppedApps` loop into one `App.update({isPinned:false}, {where:{}})`.

**Effort:** M · **Impact:** High (latency + DB contention on the hottest endpoint).

### A2 — `loadConfig()` reads and parses `config.json` from disk on every request
**File:** [`utils/loadConfig.js`](../utils/loadConfig.js) (called by nearly every controller)

`loadConfig()` does `checkFileExists()` (an `fs.access` stat) **plus** a full
`readFile` + `JSON.parse` on **every** call. A single homepage render fans out to
`/api/apps`, `/api/bookmarks`, `/api/categories`, `/api/config`, `/api/weather` — and
`getAllApps` calls `loadConfig` twice (once directly, once inside `useDocker`). That's
~6–8 synchronous disk reads of the same tiny file per page view.

**Action:** Cache the parsed config in memory and invalidate on write.
- Read once at startup into a module-level variable; have `updateConfig`/`updateCSS`
  refresh it after writing. Optionally watch the file with `fs.watch` for external edits.
- Export `getConfig()` (sync, returns cached object) instead of an async disk read.

**Effort:** S · **Impact:** High (removes per-request disk I/O across the whole API).

### A3 — Missing HTTP compression
**File:** [`api.js`](../api.js)

No `compression` middleware is registered. JSON API responses and — more importantly —
the static JS bundle and `@mdi` icon payloads are served uncompressed. Gzip/brotli
typically cuts JS/JSON transfer by 60–80%.

**Action:** `npm i compression` and `api.use(compression())` near the top of the
middleware stack (before `express.static`). Verify with `curl -H 'Accept-Encoding: gzip'
-I`.

**Effort:** S · **Impact:** Medium-High (first-load time, especially over slow links).

---

## 🟠 MEDIUM

### B1 — `axios` referenced but never imported in `App.tsx` (latent ReferenceError)
**File:** [`client/src/App.tsx`](../client/src/App.tsx) (line ~49)

The token-expiry interval calls `delete axios.defaults.headers.common['Authorization']`,
but `axios` is **not imported** in this file. The branch only fires when a token expires
while the tab is open, so it escapes notice — but it throws a `ReferenceError`, which
means the clean logout/notification never completes.

**Action:** `import axios from 'axios';` (or drop the line — the header is set per-request
via `applyAuth()` elsewhere, so this delete may be dead code). Confirm which, then fix.

**Effort:** XS · **Impact:** Medium (correctness; broken session-expiry UX).

### B2 — Dead/confusing `apps` parameter in the Docker path
**Files:** [`controllers/apps/getAllApps.js`](../controllers/apps/getAllApps.js),
[`useDocker.js`](../controllers/apps/docker/useDocker.js), `useKubernetes.js`

`getAllApps` calls `await useDocker(apps)` while `apps` is still `undefined`, and
`useDocker` reassigns its local `apps` parameter (the reassignment is discarded by the
caller). The parameter does nothing. This is a readability/foot-gun issue and made A1
harder to reason about.

**Action:** Remove the parameter; `useDocker`/`useKubernetes` should be `sync()`-style
side-effecting functions with no args (after A1 they become scheduled jobs anyway).

**Effort:** XS · **Impact:** Medium (maintainability; precondition for A1).

### B3 — WebSocket broadcast has no per-client error handling
**File:** [`Socket.js`](../Socket.js)

`send()` does `clients.forEach(client => client.send(msg))`. A client in a
closing/closed state throws synchronously and can abort the broadcast to remaining
clients. There's also no `readyState` check and no ping/pong keepalive, so dead
connections accumulate.

**Action:** Guard each send (`if (client.readyState === WebSocket.OPEN) client.send(...)`
inside a try/catch) and add a heartbeat (`ws` `isAlive`/`ping` pattern) to reap dead
sockets.

**Effort:** S · **Impact:** Medium (reliability of the weather widget under churn).

### B4 — Config dual source-of-truth (DB table + JSON file)
**Files:** `models/Config.js`, [`utils/loadConfig.js`](../utils/loadConfig.js),
`controllers/config/*`

Config lives in both the `config` SQLite table and `data/config.json`. Reads use the
file; the table is largely legacy. Two stores that can drift is a class of bug waiting to
happen and complicates A2's caching.

**Action:** Pick one. Simplest: treat `config.json` as the single runtime source (it
already is for reads) and stop writing the table, or vice-versa. Document the decision.

**Effort:** M · **Impact:** Medium (eliminates drift; simplifies the codebase).

---

## 🟡 LOW (cheap hardening / polish)

- **C1 — No DB indexes on `bookmarks.categoryId`, `apps.orderId`, `*.isPublic`.**
  ([`db/migrations/00_initial.js`](../db/migrations/00_initial.js)) Negligible at startpage
  scale, but a one-line migration adding an index on `bookmarks.categoryId` (the join/FK
  column) is free insurance. **Effort:** S.
- **C2 — Weather table grows between cleanups.**
  ([`utils/jobs.js`](../utils/jobs.js), [`clearWeatherData.js`](../utils/clearWeatherData.js))
  A row is inserted every 15 min and pruned only every 4 hours. Harmless, but you could
  simply **update a single row** instead of insert+prune. **Effort:** S.
- **C3 — 1-second `setInterval` token check in `App.tsx`.** Polls `localStorage` and
  decodes the JWT every second for the life of the tab. A 30–60s interval (or scheduling a
  single timeout to the exact `exp`) is plenty. **Effort:** XS.
- **C4 — Dead `return null` after try/catch in `parseRemoteVersion`.**
  ([`client/src/utility/checkVersion.ts`](../client/src/utility/checkVersion.ts)) Unreachable.
  Remove. **Effort:** XS.
- **C5 — Static assets lack explicit long-lived `Cache-Control`.** Vite emits
  content-hashed filenames, so `express.static` could serve them with
  `maxAge: '1y', immutable` (while keeping `index.html` uncached). **Effort:** S.
- **C6 — `console.warn`/`console.log` used directly in controllers**
  (e.g. [`getAllCategories.js`](../controllers/categories/getAllCategories.js)) instead of
  the project `Logger`. Minor consistency. **Effort:** XS.

---

## Suggested order of work

1. **A2** (config cache) and **A3** (compression) — biggest wins, lowest risk, ~1 hour each.
2. **B1** (axios import) — trivial correctness fix.
3. **A1 + B2** (move Docker sync off the request path) — the meatiest change; do together.
4. **B3** (socket robustness), **B4** (config consolidation).
5. **C1–C6** as cleanup, bundled into the above PRs where they touch the same files.

## Validation checklist (per change)
- A2: hit the API under load (`ab`/`autocannon`); confirm no per-request `config.json`
  reads (strace/`fs` log) and unchanged responses.
- A3: `curl -sH 'Accept-Encoding: gzip' -I http://localhost:5005/` shows
  `Content-Encoding: gzip`.
- A1: enable Docker integration, confirm `GET /api/apps` does **zero** writes (DB log) and
  the scheduled sync still pins/creates apps.
- B1: let a token expire with the tab open; confirm clean logout + notification, no console
  error.
- B3: open the weather widget in several tabs, kill one mid-broadcast; others keep updating.
