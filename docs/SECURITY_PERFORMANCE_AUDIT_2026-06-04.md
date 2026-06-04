# Flame — Security & Performance Audit (2026-06-04)

Fresh deep pass over the **current** codebase (after the perf refactor, hardening,
multi-arch, and the Firefox drag fixes). Complements the earlier
[SECURITY_REVIEW.md](SECURITY_REVIEW.md) and
[ARCHITECTURE_PERFORMANCE_REVIEW.md](ARCHITECTURE_PERFORMANCE_REVIEW.md) — only
**new or still-open** items are detailed here.

Security model unchanged: a single `PASSWORD` gates all writes; reads are public
(filtered by `isPublic`). Internet-facing assumed.

> **Status (2026-06-04): IMPLEMENTED — BUG-1, PERF-1, SEC-1, SEC-2, SEC-3** (shipped
> in v1.3.6). **Deferred (with rationale):** PERF-2 (MDI dynamic loader — substantial,
> needs dedicated icon-regression testing), PERF-3 (only matters at large scale),
> PERF-4 (gating weather risks stale data on first load), SEC-4 (transitive — no
> non-breaking fix; monitor), SEC-5/SEC-6 (architectural / accepted).

---

# Part 1 — Security

## ✅ Verified solid (no action)
- **Auth boundary:** login is rate-limited (`express-rate-limit`, 10 fails/15 min/IP,
  successes don't count), password compared in constant time via SHA-256 +
  `timingSafeEqual`, JWT duration allow-listed (`signToken.js`).
- **JWT secret:** auto-generated 64-byte random, persisted to `data/secret.key`,
  not baked into the image; honors a custom `SECRET` env.
- **No injection sinks:** no `eval`/`new Function`/`child_process`; the only raw SQL
  is a static `PRAGMA`; Sequelize parameterizes everything and ignores unknown
  attributes (no mass-assignment).
- **Uploads:** filenames `path.basename()`-d (no traversal); `/uploads` served with
  `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`.
- **Headers:** `helmet` on; `X-Powered-By` removed; `trust proxy` configurable.
- **Weather API key** masked for unauthenticated `GET /api/config`.
- Container runs as non-root `node`; `data/` (db, secret, config) is not served.

## 🟠 Open findings

### SEC-1 (LOW) — No upload size/count limit
`middleware/multer.js` configures `multer({ storage, fileFilter })` with **no
`limits`**. An authenticated admin (or anyone who obtains the password) can upload
arbitrarily large/many files → disk exhaustion DoS.
- **Fix:** `multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1 } })`.

### SEC-2 (LOW, defense-in-depth) — `fileFilter` trusts client MIME type
`fileFilter` allow-lists `file.mimetype`, which the client controls/spoofs. Today
this is mitigated (the `/uploads` sandbox + `nosniff` stop stored-content from
executing), so it's not currently exploitable — but magic-byte validation and/or
SVG sanitization on upload would harden it if that sandbox ever changes.

### SEC-3 (LOW) — 500 responses echo internal error messages
`middleware/errorHandler.js` returns `error.message` to the client for any error,
including unexpected 500s (e.g. a DB error or a `ReferenceError` — see BUG-1).
That can leak internal detail (schema names, stack-ish messages).
- **Fix:** in production, return a generic `"Server Error"` for non-operational
  errors (those without an explicit `statusCode`); keep the real message in the log.

### SEC-4 (LOW) — Transitive server dependency vulnerabilities
`npm audit` (server) still reports ~13 transitive issues (`tar`, `cacache`,
`@tootallnate/once` under `sqlite3`→`node-gyp`; `uuid` under `sequelize`; `ajv`).
All are build/transitive and only "fixable" by app-breaking majors (`sqlite3@6`,
`sequelize@3`). **Accepted; monitor** for non-breaking patched releases. Client is
clean (0 vulns).

### SEC-5 (INFO) — JWT stored in `localStorage` with CSP disabled
Tokens live in `localStorage` and CSP is intentionally off (custom CSS/arbitrary
icon URLs). If an XSS were ever introduced, the token is readable. The XSS surface
is currently small (React escapes output; uploads are sandboxed; custom "CSS" is
CSS, not JS). Noted as residual risk, not an active vuln.

### SEC-6 (INFO, accepted) — SSRF via `dockerHost`
`useDocker` fetches the admin-configured `dockerHost`. Only an authenticated admin
can set it (single-user app); mitigating further breaks the feature. Accepted.

---

# Part 2 — Performance

## ✅ Already optimized (recent work)
Config cached in memory (no per-request disk read), `compression` (gzip),
Docker/K8s sync moved off the public `GET /api/apps` to a scheduled job, hashed
`/assets` cached `immutable` 1y, client code-split (main bundle 3.2 MB → ~280 KB /
90 KB gzip), `bookmarks.categoryId` indexed, weather kept to a single updated row,
optimistic reorder.

## 🟠 Open findings

### PERF-1 (HIGH value, low risk) — SQLite not in WAL mode
`db/index.js` only sets `PRAGMA foreign_keys = ON`. It uses the default rollback
journal with no busy timeout. With concurrent readers (public page loads) and
writers (the scheduled Docker/weather jobs, reorders, edits), the default mode
**serializes readers against the writer** and can raise `SQLITE_BUSY`
("database is locked").
- **Fix (one-time, at connect):**
  ```js
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await sequelize.query('PRAGMA busy_timeout = 5000;');
  await sequelize.query('PRAGMA synchronous = NORMAL;');
  ```
  WAL lets reads proceed concurrently with a write; `busy_timeout` avoids spurious
  lock errors. Big resilience/throughput win for near-zero effort.

### PERF-2 (MEDIUM) — `vendor-mdi` is ~806 KB gzip on first load
The build still ships the full `@mdi/js` icon set (`vendor-mdi` chunk, 2.79 MB raw
/ 806 KB gzip) because the icon component resolves arbitrary user-chosen icon names
from the whole set. It's split into its own cacheable chunk now, but it's still the
dominant first-load payload.
- **Fix (dedicated effort):** a dynamic/registry icon loader that imports only the
  icons actually used, or lazy-loads the full set only when the icon picker opens.

### PERF-3 (LOW) — `getAllCategories` name-ordering can't use an index
When `useOrdering = 'name'`, ordering uses `lower(name)` (a function), so SQLite
can't use an index, and the query always eager-loads every bookmark. Negligible at
startpage scale; revisit only if categories/bookmarks grow large (a generated
lowercase column + index would fix it).

### PERF-4 (LOW) — Weather job runs regardless of connected clients
The 15-min weather refresh + external API call runs even with zero browsers open.
Fine within the free quota; could be gated on active WebSocket clients to cut
unnecessary external calls.

## ✅ Not a concern
- The two document-level click guards (`useDragClickGuard`) run a trivial ref-check
  per click — negligible.
- API reads send `Cache-Control: no-store` (apps) which is correct for dynamic data.

---

# Bugs found during the audit

### BUG-1 (correctness) — `updateApp.js` uses `ErrorResponse` without importing it
`controllers/apps/updateApp.js` calls `new ErrorResponse(...)` on the "app not
found" path but never `require`s it (every other controller does). A `PUT
/api/apps/:id` to a non-existent id throws `ReferenceError: ErrorResponse is not
defined` → a 500 with a leaked message (see SEC-3) instead of a clean 404.
- **Fix:** `const ErrorResponse = require('../../utils/ErrorResponse');`

---

# Suggested order
1. **BUG-1** + **PERF-1 (WAL)** — tiny, high-value, low-risk. Do first.
2. **SEC-1** (upload limits), **SEC-3** (generic 500s) — small hardening.
3. **PERF-2** (MDI loader) — the one substantial effort; schedule separately.
4. **SEC-4** — recheck on each dependency bump.
