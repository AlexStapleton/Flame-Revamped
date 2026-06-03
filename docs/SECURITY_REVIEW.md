# Flame — Security Review (2026-06-03)

Pre-deployment audit. Target deployment: **internet-facing**. No code was changed by this
review — findings only.

**Security model:** single `PASSWORD` gates all writes; reads are public (filtered by
`isPublic`). The login endpoint is effectively the entire security boundary, so the
highest-impact findings cluster there.

> Bottom line: **Do not expose to the internet until H1, H2, and H3 are addressed.**
>
> **UPDATE 2026-06-03: All three HIGH items are now FIXED and verified (see ✅ notes
> below). MEDIUM and LOW items remain open.**

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

## 🟠 MEDIUM

### M1 — Weather API key sent over cleartext HTTP
`utils/getExternalWeather.js` calls `http://api.weatherapi.com/v1/current.json?key=<KEY>...`.
The key travels unencrypted and is interceptable on-path.
- **Fix:** use `https://`.

### M2 — Unauthenticated `/api/weather/update`
`routes/weather.js` exposes a public GET that triggers an external API call using the stored
key — abusable to exhaust the weather-API quota.
- **Fix:** require auth; the scheduled job already refreshes weather.

### M3 — No security headers
`api.js` has no `helmet`/CSP — missing clickjacking protection (`X-Frame-Options`),
`X-Content-Type-Options: nosniff`, etc.
- **Fix:** add `helmet`, tuning CSP because custom CSS/themes are a feature.

### M4 — Upload filename unsanitized → path traversal + SVG stored-XSS
`middleware/multer.js` stores `Date.now() + '--' + file.originalname` with no sanitization,
so `../` in `originalname` can escape `data/uploads`; allowed SVG uploads served from
`/uploads` can carry `<script>`. Post-auth (admin) only → medium.
- **Fix:** `path.basename()` the stored name; serve `/uploads` with
  `X-Content-Type-Options: nosniff` and/or sanitize SVGs.

---

## 🟡 LOW (mostly admin-only / hardening)

- **L1 — Client controls token lifetime.** `utils/signToken.js` passes the client's
  `duration` straight to `expiresIn` with no cap → authed client can mint a multi-year token.
  Cap server-side.
- **L2 — Non-constant-time password compare** (`==`) in `controllers/auth/login.js`.
  Use `crypto.timingSafeEqual` + strict `===`.
- **L3 — SSRF via `dockerHost`** (`controllers/apps/docker/useDocker.js`) — admin-configurable
  request target. Admin-only → low.
- **L4 — `updateConfig` accepts arbitrary keys** (`controllers/config/updateConfig.js`) — no
  whitelist; admin can pollute config. Admin-only → low.
- **L5 — `.env.example` defaults to `NODE_ENV=development`** (verbose errors) for local/compose
  users. The Docker image is unaffected (sets production, excludes `.env`).

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
