# Flame — Architecture, Dependencies & CVE Analysis

**Generated:** 2026-06-05 · **App version:** 2.4.3 · **Release line:** v1.3.7
**CVE data source:** `npm audit` (GitHub Advisory Database) — point-in-time; re-run on
every dependency change.

---

## 1. Architecture

Flame is a self-hosted start page: a Node/Express + SQLite backend serving a React SPA,
plus a WebSocket channel and scheduled jobs.

```
                                   ┌────────────────────────── Browser (SPA) ──────────────────────────┐
                                   │  React 19 + Redux (Vite build)                                     │
                                   │   • Home (eager)  • Apps/Bookmarks/Settings (lazy chunks)          │
                                   │   • dnd-kit reorder  • @mdi icons (async chunk)  • skycons weather │
                                   └───┬───────────────────────────────┬────────────────────────────┬──┘
                            HTTP /api  │                       WS /socket│                  static /  │
                                       ▼                                 ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ server.js  (bootstrap)                                                                                  │
│   initializeSecret() → connectDB() → associateModels() → jobs() → http.createServer(api) + Socket(ws)   │
│                                                                                                          │
│ api.js  (Express app)                                                                                    │
│   helmet → compression(gzip) → morgan(access.log) → /health → static(public, /uploads sandboxed)         │
│   → express.json → routes/* → errorHandler                                                               │
│                                                                                                          │
│   routes/*  →  middleware (auth → requireAuth → multer/requireBody)  →  controllers/*                     │
│        /api/apps  /api/bookmarks  /api/categories  /api/queries  /api/themes                              │
│        /api/config  /api/weather  /api/auth  /api/version  /api/changelog                                 │
│                                                                                                          │
│   controllers/*  →  Sequelize models (App, Bookmark, Category, Config, Weather)  →  SQLite (WAL)          │
│                                                                                                          │
│ utils/jobs.js (node-schedule)                                                                            │
│   • weather refresh every 15m → getExternalWeather → weatherapi.com → push over WS                       │
│   • app sync every 1m → useDocker / useKubernetes → Docker socket / K8s Ingress API                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
                  │                         │                                  │
                  ▼                         ▼                                  ▼
        data/db.sqlite (+ -wal/-shm)   data/config.json (cached)        data/uploads/, data/secret.key
```

### Key design points
- **Auth model:** a single `PASSWORD` gates all writes; reads are public, filtered by
  `isPublic`. Login issues a JWT (HMAC, auto-generated 64-byte secret in
  `data/secret.key`), sent by the client in an `Authorization-Flame: Bearer` header and
  stored in `localStorage`. `auth` middleware sets `req.isAuthenticated`; `requireAuth`
  enforces it on mutations. Login is rate-limited (10 fails / 15 min / IP) and the
  password is compared in constant time.
- **Config:** `data/config.json` is the runtime source of truth (read through an
  in-memory cache in `utils/loadConfig.js`). The `config` SQLite table is legacy
  (migration-only).
- **Request lifecycle:** `route → auth → [requireAuth] → [multer/requireBody] →
  asyncWrapper(controller) → Sequelize → JSON`. Errors funnel through `errorHandler`
  (generic message for unexpected 500s in production).
- **Real-time:** one WebSocket (`/socket`) broadcasts weather updates; a heartbeat reaps
  dead clients.
- **Integrations (opt-in):** Docker (via `/var/run/docker.sock` or a TCP host) and
  Kubernetes Ingress discovery, run on a schedule (off the request path).
- **Deployment:** multi-arch (`linux/amd64,linux/arm64`) Docker image built from
  `.docker/Dockerfile.multiarch`, published by GitHub Actions on `v*` tags. Runs as
  non-root `node`; `data/` is a volume; `data/` and `.env` are never served.

### Frontend
React 19 SPA built by Vite. Redux (thunks) manages state; reorders are optimistic.
Routes are code-split (Home eager; Apps/Bookmarks/Settings lazy). The `@mdi/js` icon set
is dynamically imported (async chunk) to keep it off the initial load. Drag-reorder uses
dnd-kit with a document-level click guard (Firefox fix).

---

## 2. Dependency inventory (installed versions)

### Backend — runtime (`dependencies`)
| Package | Version | Role |
|---------|---------|------|
| express | 5.2.1 | HTTP framework |
| sequelize | 6.37.8 | ORM |
| sqlite3 | 5.1.7 | SQLite driver (native; build-time node-gyp) |
| umzug | 3.8.2 | DB migrations runner |
| jsonwebtoken | 9.0.3 | JWT sign/verify |
| ws | 8.21.0 | WebSocket server (weather push) |
| axios | 1.16.1 | HTTP client (weather, Docker API, version check) |
| helmet | 8.2.0 | Security headers |
| express-rate-limit | 8.5.2 | Login brute-force throttle |
| compression | 1.8.1 | gzip responses |
| morgan | 1.11.0 | Access logging (fail2ban/health) |
| multer | 2.1.1 | Icon uploads (size/ext limited) |
| node-schedule | 2.1.1 | Cron jobs (weather, app sync) |
| @kubernetes/client-node | 1.4.0 | K8s Ingress discovery (opt-in) |
| dotenv | 17.4.2 | `.env` loading |
| docker-secret | 1.2.4 | `*_FILE` secret support |
| @types/express | 4.17.x | Types only |
| concurrently | 6.x | Dev-only script runner |
| nodemon (dev) | 3.x | Dev reload |

### Frontend — runtime (`dependencies`)
| Package | Version | Role |
|---------|---------|------|
| react / react-dom | 19.2.5 | UI runtime |
| react-router-dom | 7.16.0 | Routing |
| redux / react-redux / redux-thunk | 5.0.1 / 9.2.0 / 3.1.0 | State management |
| axios | 1.16.1 | API calls |
| @dnd-kit/core / @dnd-kit/sortable | 6.3.1 / 10.0.0 | Drag-to-reorder |
| @mdi/js / @mdi/react | 7.4.47 / 1.6.1 | Material Design Icons (lazy-loaded) |
| skycons-ts | 1.0.0 | Animated weather icons |
| jwt-decode / react-jwt | 4.0.0 / 2.0.0 | Client-side token decode |
| typescript | 5.9.3 | Language |

### Frontend — build (`devDependencies`)
vite 7.3.2 · esbuild 0.27.7 · @vitejs/plugin-react 5.x · vite-plugin-svgr 4.x ·
vite-tsconfig-paths 6.x · prettier 3.x · cross-env 10.x. (Build-time only — not shipped
in the image.)

---

## 3. CVE / advisory analysis

> Methodology: `npm audit` against the GitHub Advisory DB for the installed tree, then
> trace each advisory's dependency chain and assess **reachability** in Flame's actual
> runtime (not just presence in `node_modules`).

### Frontend — ✅ 0 advisories
`npm audit` (client) reports **no vulnerabilities** at any severity.

### Backend — 13 advisories, all transitive (2 low / 6 moderate / 5 high)

| Severity | Package (installed) | Advisory | Chain (top-level) | Reachable here? |
|----------|--------------------|----------|-------------------|-----------------|
| HIGH | tar 6.2.1 | GHSA-34x7-hfp2-rc4v — hardlink path traversal | `sqlite3 → node-gyp → (cacache) → tar` | **No** |
| HIGH | tar 6.2.1 | GHSA-8qq5-rm4j-mr97 — arbitrary overwrite / symlink poisoning | same | **No** |
| HIGH | tar 6.2.1 | GHSA-83g3-92jg-28cx — file read/write via hardlink-through-symlink | same | **No** |
| HIGH | tar 6.2.1 | GHSA-qffp-2rhf-9h96 — drive-relative linkpath traversal | same | **No** |
| HIGH | tar 6.2.1 | GHSA-9ppj-qmqm-q256 — symlink drive-relative linkpath traversal | same | **No** |
| MOD  | tar 6.2.1 | GHSA-r6q2-hw4h-h46w — APFS unicode race condition | same | **No** |
| MOD  | ajv 8.13.0 | GHSA-2g4f-4pwh-qvx6 — ReDoS via `$data` option | `@kubernetes/client-node → @rushstack/ts-command-line → … → ajv` | **No** |
| MOD  | uuid 8.3.2 | GHSA-w5hq-g745-h8pq — missing buffer bounds check (v3/v5/v6 w/ `buf`) | `sequelize → uuid` | **No** |
| LOW  | @tootallnate/once 1.1.2 | GHSA-vpq2-c234-7xj6 — incorrect control-flow scoping | `sqlite3 → node-gyp → make-fetch-happen → @tootallnate/once` | **No** |
| LOW  | cacache 15.3.0 | (via tar) | `sqlite3 → node-gyp → make-fetch-happen → cacache` | **No** |

### Why none are reachable
1. **The `tar` / `cacache` / `@tootallnate/once` cluster (8 of 13, incl. all 5 HIGHs)**
   lives under **`sqlite3 → node-gyp`**. `node-gyp` is the *build toolchain* that compiles
   sqlite3's native binding **at install time**. At runtime the app loads the compiled
   `.node` binary; it never invokes `node-gyp`/`tar`/`cacache`. The `tar` path-traversal
   advisories require **extracting an attacker-controlled archive** — Flame never extracts
   tarballs. So these are loud-but-inert.
2. **`ajv` ReDoS** is inside `@kubernetes/client-node`'s `@rushstack` config tooling. The
   K8s integration is **opt-in (off by default)**, and ajv is used for the client's own
   internal schema parsing — not fed untrusted user input.
3. **`uuid` bounds check** triggers only when a caller passes a `buf` argument to uuid
   v3/v5/v6. `sequelize` uses uuid for value generation and does not expose that path to
   user-controlled input.

**Bottom line:** no advisory is reachable from untrusted input in Flame's runtime. The
HIGH ratings reflect `tar`'s general danger, not an exposure here. Client is clean.

### Remediation status & options
- `npm audit fix` (non-breaking) resolves **none** of these — every fix requires a
  breaking major (`npm audit fix --force` wants to downgrade/replace `sqlite3` and
  `sequelize`), which would break the DB layer. **Not applied** (accepted, documented).
- **Durable fixes (future, optional):**
  - Replace `sqlite3` with **`better-sqlite3`** — drops the entire `node-gyp → tar/cacache`
    chain (ships prebuilt binaries, no runtime build toolchain), and is faster. Requires a
    Sequelize dialect swap + testing.
  - If Kubernetes discovery is unused, **removing `@kubernetes/client-node`** eliminates
    the `ajv` advisory and a large dep subtree.
  - Watch for `sequelize@7` (bumps `uuid`) once stable.
- **Recommended cadence:** re-run `npm audit` on every dependency change and in CI; revisit
  these if any gains a non-breaking patched release or becomes runtime-reachable.

### Verified-good security properties (unchanged)
Auto-generated JWT secret (not baked into the image), constant-time password compare,
allow-listed token durations, rate-limited login, parameterized queries (no injection
sinks — no `eval`/`exec`/`child_process`), upload path-traversal fix + sandboxed
`/uploads`, helmet headers, weather-key masking for anon, generic 500s in prod, non-root
container, `data/` not served.
