# Flame — Security Review (2026-06-03)

Pre-deployment audit. Target deployment: **internet-facing**. No code was changed by this
review — findings only.

**Security model:** single `PASSWORD` gates all writes; reads are public (filtered by
`isPublic`). The login endpoint is effectively the entire security boundary, so the
highest-impact findings cluster there.

> Bottom line: **Do not expose to the internet until H1, H2, and H3 are addressed.**
>
> **UPDATE 2026-06-03: All three HIGH items AND all four MEDIUM items are now FIXED and
> verified (see ✅ notes below). LOW items remain open.**

---

## 🔴 HIGH — ✅ all fixed

### H1 — No brute-force protection on login — ✅ FIXED
**Fix applied:** `express-rate-limit` on `/api/auth` (`routes/auth.js`) — 10 failed
attempts / 15 min per IP, successful logins don't count. `morgan` access logging to
`log/access.log` (`api.js`, resolves to `/app/log/access.log` in the container) enables
fail2ban and the `/health` log scan. `trust proxy` is configurable via `TRUST_PROXY`.
*Verified:* 10×`401` then `429`; access log records the attempts.
`controllers/auth/login.js` — unlimited password attempts: no rate limiting, no lockout.
No request/access logging exists anywhere (the `access.log` the healthcheck references is
never written), so fail2ban can't compensate. With a single-password model this means the
whole app can be brute-forced.
- **Fix:** add `express-rate-limit` to `/api/auth` (e.g. 5–10 attempts / 15 min per IP);
  optionally add access logging (`morgan` → file) so a fail2ban jail can ban offenders.

### H2 — Weather API key disclosed to unauthenticated users — ✅ FIXED
`controllers/config/getConfig.js` was `@access Public` and returned the **entire**
`data/config.json`, including `WEATHER_API_KEY`.
- **Fix applied:** `GET /api/config` now runs the `auth` middleware; `getConfig` masks
  `WEATHER_API_KEY` to a truthy-but-non-secret flag (`'true'`) for unauthenticated
  requests (preserving the public weather widget) and returns the real key only to
  authenticated requests. The client `getConfig` action now sends auth so the admin
  settings form still receives the real key. *Verified:* anon read → `"true"`, authed
  read → real key.

### H3 — Weak default password shipped & documented — ✅ FIXED
`.env.example` and `README.md` used `PASSWORD=flame_password`.
- **Fix applied:** `server.js` now exits if `PASSWORD` is unset/empty and prints a loud
  multi-line warning banner if it equals the old default `flame_password`. `.env.example`
  no longer ships the default (empty + a "set a strong password" comment). *Verified:*
  startup banner shown with the current default. **Action for you:** set a strong unique
  `PASSWORD` before exposing this instance (it currently still uses the default).

---

## 🟠 MEDIUM — ✅ all fixed

### M1 — Weather API key sent over cleartext HTTP — ✅ FIXED
`utils/getExternalWeather.js` called `http://api.weatherapi.com/...?key=<KEY>`.
- **Fix applied:** switched to `https://`.

### M2 — Unauthenticated `/api/weather/update` — ✅ FIXED
Public GET triggered an external API call using the stored key (quota abuse).
- **Fix applied:** `routes/weather.js` now requires `auth, requireAuth`; the client
  settings form sends auth on its refresh call. *Verified:* `401` without auth, passes
  auth with a token (the scheduled job still refreshes weather independently).

### M3 — No security headers — ✅ FIXED
- **Fix applied:** `helmet` added in `api.js`. CSP is intentionally left **off** (Flame
  loads icons from arbitrary user URLs and supports custom CSS/themes, which a strict CSP
  would break); a tailored CSP is a possible future hardening that needs per-deployment
  browser testing. *Verified:* responses now send `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control: off`, and `X-Powered-By`
  is removed.

### M4 — Upload filename unsanitized → path traversal (+ SVG concern) — ✅ FIXED
- **Fix applied:** `middleware/multer.js` now `path.basename()`s the original name, so
  `../` can't escape `data/uploads`. `/uploads` is served with
  `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none';
  sandbox` so a malicious upload can't execute script if navigated to directly. *Verified:*
  `basename('../../../server.js') → 'server.js'`; the hardening headers are present on
  `/uploads`. (Note: the client has no runtime SVG-inlining loader, so the stored-SVG-XSS
  vector is not actually reachable today; full SVG sanitization on upload remains a future
  option if such a loader is ever added.)

---

## 🟡 LOW (mostly admin-only / hardening)

- **L1 — Client controls token lifetime — ✅ FIXED.** `utils/signToken.js` now allowlists
  the duration to the values the UI offers (`1h/1d/14d/30d/1y`), defaulting to `14d`, so a
  custom `duration` can't mint a never-expiring token.
- **L2 — Non-constant-time password compare — ✅ FIXED.** `controllers/auth/login.js` now
  compares fixed-length SHA-256 digests with `crypto.timingSafeEqual` (no length/timing leak).
- **L3 — SSRF via `dockerHost`** (`controllers/apps/docker/useDocker.js`) —
  **accepted (won't fix).** The Docker integration must reach the operator's configured
  Docker host, and only an authenticated admin can set it (single-user app). Mitigating
  further would break the feature.
- **L4 — `updateConfig` accepts arbitrary keys — ✅ FIXED.** `controllers/config/updateConfig.js`
  now only applies keys that already exist in the config, so unknown keys can't pollute it.
- **L5 — `.env.example` `NODE_ENV` default — ✅ FIXED.** Example now defaults to `production`
  (comment notes to use `development` only for local dev).

---

## ✅ Verified good
- Auth-bypass (previously flagged) is **fixed** (`middleware/auth.js`).
- JWT secret auto-generated (64-byte random), **not** baked into the image — `.dockerignore`
  excludes `.env` / `.env.*`.
- Sequelize parameterizes queries and ignores unknown attributes → the create/update body
  spread is **not** exploitable mass-assignment.
- `data/` (db, `secret.key`, config) is **not** served statically — only `public/` and
  `data/uploads`.
- Container runs as non-root `node`.

---

## Suggested order of remediation
1. **H1, H2, H3** (blockers for internet exposure).
2. **M1, M2, M3, M4.**
3. **L1, L2** (cheap), then L3–L5.
4. Re-run `npm audit` after any dependency additions (`helmet`, `express-rate-limit`, `morgan`).
