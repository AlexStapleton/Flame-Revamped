# Flame-Revamped v1.7.1: security, performance and feature analysis

Analysed commit `77d1d4d` (v1.7.1) on 2026-10-10.

## Method

- I read the whole server (`api.js`, routes, middleware, controllers, utils, models, migrations), the Dockerfiles, the k8s manifests and CI, plus the client's security- and performance-relevant parts (URL handling, icons, auth/token storage, polling, the WebSocket client, the Vite config).
- I ran `npm test`: 43/43 pass.
- I ran `npm audit --omit=dev` for the server and the client.
- I did a production client build (`vite build`) to measure bundle sizes.
- I reproduced the top finding (S1) in headless Chromium with the exact library version the client ships (`external-svg-loader@1.7.1`).
- **Verified** means I reproduced it or confirmed it by running code. **Code-read** means I concluded it from reading the source without running it.

---

## Remediation status

| ID | Finding | Status |
|---|---|---|
| S1 | SVG icon XSS via `external-svg-loader` | **Fixed** |
| S2 | `javascript://` URLs via search-bar redirect | **Fixed** |
| S3 / P2 | `/health` log scan: spoofable, leaks the log, slow | **Fixed** |
| S4 | Unauthenticated resource exhaustion (WebSocket, JSON bodies) | **Fixed** |
| S5 | No Content-Security-Policy | **Fixed** |
| S6 | Tokens can't be revoked | **Fixed** (password-bound tokens) |
| S7 | Dependency advisories | **Fixed**, except 1 accepted, unreachable item (see below) |
| S8 | Docker integration risk | **Fixed** (code changes plus documentation) |
| S9 | Smaller issues | **Fixed** |
| S10 | **New:** one malformed WebSocket frame crashes the server | **Fixed** (verified) |
| B1 | `/api/changelog` 500 in the single-arch image | **Fixed** |
| P1 | Full MDI icon set loaded on the homescreen | **Fixed**: homescreen JS 759 KB → 131 KB (−83%) |
| P3 | Docker/k8s sync churn, unpins everything, flicker | **Fixed** |
| P4 | Overlapping status runs; GET probe downloads whole bodies | **Fixed** |
| P5 | Home re-renders on any state change; weather socket never reconnects | **Fixed** |
| P6 | Per-request file reads; non-transactional reorders | **Fixed** |
| B2 / B3 / B4 | Imported CSS lost on restart; weather key needs restart; empty public category 404s | **Fixed** |
| B5 | `/settings/*` not wrapped in `ProtectedRoute` | Not changed (intentional; the server enforces auth) |

### Performance fixes: what changed and how it was verified

**P1: icons.**

- **Server.** New `GET /api/icons?names=mdiX,...` endpoint, public. It lazy-loads `@mdi/js` on first use and validates names against `^mdi[A-Z][A-Za-z0-9]*$` (at most 300 names, 8 KB query). Responses carry `Cache-Control: public, max-age=86400`.
- **Client.** `Icon.tsx` batches the names requested in the same tick into one request and caches the results in memory. Unknown names fall back to `mdiCancel`, which is bundled statically.
- **The `mdi-*.js` chunk no longer exists.** I measured in Chromium with brotli and three apps on the homescreen:

| | Before | After |
|---|---|---|
| JavaScript transferred on `/` | 759,316 B | 130,870 B |
| All bytes on page | 839,252 B | 215,010 B |
| `/api/icons` responses | – | ~2 KB each |

- **Icons are unchanged.** On the final integrated build, the Docker and Plex cards render their real MDI paths, not the cancel fallback.

**P3: sync.**

- **New `source` column.** Migration `08_app-source` adds a nullable `apps.source` (`docker` / `kubernetes` / null meaning manual).
- **Diff, then one transaction.** `computeSyncPlan` is a pure, tested function that diffs existing apps against what was discovered. `applySyncPlan` applies the result in one transaction. An unchanged state means 0 writes.
- **"Unpin stopped apps" only touches same-source apps.** Apps you added by hand, or that came from the other source, are never unpinned.
- **Adoption of older apps.** Apps that existed before the migration are adopted by name on their next sync.
- **Scheduled sync is idle-gated** like status checks, with an in-flight guard. The startup sync and `POST /api/apps/sync` always run.

**P4: status checks.**

- **No overlapping runs.** An in-flight guard skips a tick while the previous run is still going.
- **Probes read headers only.** They use `responseType: 'stream'` and destroy the body stream and the request as soon as headers arrive. A test against a local 20 MB server confirms the socket closes early.

**P5: client.**

- **`Home` re-renders less.** It uses six narrow `useSelector`s instead of selecting the whole store.
- **The weather socket reconnects.** It backs off exponentially (1 s up to 60 s), pauses while the tab is hidden, and uses a functional state update (this fixes a stale-closure bug).

**P6: small items.**

- **Cached file reads.** CHANGELOG and version info are cached after the first successful read.
- **Reorders.** Apps, bookmarks and categories reorder sequentially inside one transaction, and a malformed body now returns 400 instead of 500.

**B2–B4: functional bugs.**

- **B2:** imported CSS is written to both `public/` and `data/`.
- **B3:** the weather jobs are always scheduled and read the current key on each run. Setting a key fetches immediately.
- **B4:** the guest category lookup uses a left join (`required: false`).

**Follow-up bundle work (after P1).**

With the icon set gone, a sourcemap breakdown of the entry chunk showed:

| Package | Size (raw) |
|---|---|
| react-dom | 173 KB |
| axios | 51 KB |
| DOMPurify | 29 KB |
| skycons | 12 KB |

Changes:

- **`react-dom` moved into the `vendor-react` chunk.** `manualChunks` is now a function keyed on package name, because the old config missed `react-dom/client`. React now stays cached across app releases.
- **DOMPurify loads lazily** in `SafeSvgIcon`, with the same sanitize config, failing closed. **skycons loads lazily** in `WeatherIcon`.
- **The homescreen grids render without dnd-kit.** The sortable versions, with sensors and the click guard moved over unchanged, are loaded through `React.lazy` only when sorting is enabled: authenticated, ordering by `orderId`, and no active search. Guests never download dnd-kit.
- **Icon requests are batched with a 20 ms debounce** (100 ms cap) instead of `setTimeout(0)`.
- **The admin pages and their child components use narrow `useSelector`s.** None subscribes to the whole store any more.
- **Results:**
  - The entry chunk went from 331 KB to 106 KB raw (106 KB to 36 KB gzip).
  - Guest JS on `/` went from 131 KB to 113 KB brotli.
  - Admin JS went up by 2 KB, because the small lazy sortable chunks are separate requests.
  - Admin drag-reorder still works, including the post-drag click guard, checked in Chromium.
- **Not done: replacing axios with `fetch`** (about 18 KB gzip). Every Redux action uses axios, so it's a larger refactor for a modest gain.

**Test suite after the performance work.** 149/149 pass. The client builds, with no `mdi` chunk. A Chromium end-to-end run on the integrated build re-checked the S1, S2 and S5 regressions: the token isn't stolen, `javascript:` URLs return 400, and there are 0 CSP violations.

**Not covered by automated tests.**

- Weather socket reconnect, B3 and P3 against a live Docker daemon. Check them manually: restart the server with a dashboard open, add a weather key in Settings, and toggle "unpin stopped apps" with Docker discovery on.

### Security fixes: what changed and how it was verified

**S1: SVG icon XSS.**

- `external-svg-loader` is removed. It is replaced by `client/src/components/UI/Icons/SafeSvgIcon/SafeSvgIcon.tsx`, which fetches each SVG once per URL, sanitizes it with DOMPurify (`RETURN_DOM`, so the markup is never re-serialized and re-parsed), and inserts only the sanitized root `<svg>`.
- **Forbidden tags:** `foreignObject`, `script`, `iframe`, `use`, `a`, `style`, `animate*`, `set`.
- **Forbidden attributes:** `href`, `xlink:href`.
- **Kept on purpose:** inline SVG with `fill="var(--color-primary)"`, so icon theming still works.
- **Trade-off:** third-party SVGs that rely on `<use>`, an inner `<style>` or `<a>` lose those parts.
- **Verified end to end in headless Chromium.** I uploaded the PoC SVG as an app icon on a running server.
  - With the v1.7.1 client build, the page title became `PWNED:<real JWT>`.
  - With the patched build, the title is unchanged, there are 0 `iframe` and 0 `foreignObject` elements, and benign SVG icons still render.

**S2: `javascript://` URLs.**

- **The check.** `utils/urlSafety.js` and `client/src/utility/urlSafety.ts` (duplicates of each other) implement `isDangerousUrl`. It normalizes the URL the way browsers do (strips leading C0 controls and spaces, removes tab, CR and LF anywhere, lowercases) and denies the schemes `javascript`, `vbscript`, `data`, `blob` and `file`.
- **Why a denylist.** I chose it over an allowlist so that custom schemes such as `steam://`, `ssh://`, `vnc://` and `mailto:` keep working.
- **Where it is enforced:**
  - App and bookmark create/update return 400.
  - Docker and Kubernetes discovery skip the app and log a warning.
  - `validateBackup` rejects the import.
  - On the client, `urlParser` returns `#` and `redirectUrl` does nothing.
- **Verified end to end.** `javascript://%0a…` and `JaVa<TAB>ScRiPt:…` are both rejected with `400 Invalid URL scheme`. Unit tests are in `test/urlSafety.test.js`.
- **Existing data.** Dangerous URLs already in the database are not migrated. The client guards make them inert.

**S3/P2: `/health`.**

- `/health` now checks only that `data/config.json` exists and that `SELECT 1` succeeds, with a 2 s timeout.
- It never reads `access.log`, `?debug` was removed, it sends `Cache-Control: no-store`, and its error strings are generic.
- **Verified on a live server.** After six requests to `/ERROR`, `/health?debug=true` still returns `200 {"status":"healthy","errors":[]}`. Unit tests are in `test/health.test.js`.

**S7: dependencies.**

- `concurrently` and `@types/express` moved to `devDependencies`.
- I ran `npm audit fix` (without `--force`) on the server and the client, which brought `react-router` to 7.18.4.
- **Server:** advisories went from 19 (3 critical, 8 high) to 4 moderate.
- **Client:** advisories went from 6 (4 high) to 1 low.
- **Still open (each needs a decision):**
  - **Server:** 4 moderate advisories in `sprintf-js`, through `umzug → @rushstack/ts-command-line → argparse`. The only fix npm offers is a major downgrade of umzug, which runs the migrations.
  - **Client:** `esbuild` (low), which only affects the dev server on Windows.

**S4: input limits.**

- The WebSocket server only accepts upgrades on `/socket`, with `maxPayload: 1024`. Oversized frames close with code 1009.
- The global JSON limit is 100 kb. `/api/backup/import` has its own 10 MB parser, mounted before the global one.
- **Tests** in `test/limits.test.js`:
  - a 200 KB body to a public route returns 413;
  - a 2 MB import still reaches auth, so it gets 401, not 413.
- **No Origin check on the socket.** It only broadcasts public weather data, and Origin checks break behind some proxies.

**S10 (new, found while fixing S4): one malformed WebSocket frame crashes the server.**

- **Cause.** v1.7.1 attached no `'error'` listener to WebSocket clients. So a single frame with a reserved opcode, sent *unauthenticated* to any path, threw `RangeError: Invalid WebSocket frame` and killed the Node process.
- **Reproduced** against the v1.7.1 `Socket.js`: the process exited with code 1.
- **Fixed** with a per-client `'error'` listener, which logs a warning and closes only that connection. The patched server survives the same frame.

**S5: Content-Security-Policy.** The policy set through helmet:

```
default-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; connect-src 'self' https: http: ws: wss:; worker-src 'self' blob:; manifest-src 'self'
```

- **Escape hatch:** `CSP=off` disables it and logs a warning. It is documented in the README and `.env.example`.
- **Why `connect-src` stays broad:** `SafeSvgIcon` fetches external SVG icon URLs over both http and https.
- **`/uploads`** keeps its stricter sandbox CSP.
- **Verified in Chromium** on the merged branch:
  - 0 CSP violations across the pages, with icons still rendering;
  - an injected inline `<script>` and an `onerror` handler are both blocked.

**S6: revocation on password change.**

- **The binding.** Each JWT carries `pwf`, an HMAC-SHA256 keyed with `SECRET` over the password, truncated to 22 characters. Keying it means the claim doesn't leak a crackable password hash. `utils/verifyToken.js` checks `pwf` in constant time and pins `algorithms: ['HS256']`. Both the auth middleware and `/api/auth/validate` use it.
- **Verified live.** After restarting with a new `PASSWORD`, the old token gets 401 and private apps disappear.
- **Upgrade note.** Tokens issued before this change have no `pwf`, so everyone logs in once after upgrading. This is in the CHANGELOG.

**S7: remaining advisories.**

- **Client: 0 advisories.** The unused direct `esbuild` dependency was removed, vite went to 7.3.7, and an override sets `esbuild` to `^0.28.2`.
- **Server: 4 moderate, accepted.** They are all `sprintf-js` through `umzug → @rushstack/ts-command-line → argparse`.
  - No patched `sprintf-js` exists (affected is ≤ 1.1.3, the latest release).
  - No `umzug` 3.x or `ts-command-line` release drops `argparse` 1.x.
- **Why this is acceptable.** `umzug` loads its CLI module at require time, but Flame never runs the CLI. Wrapping `sprintf` during a full migration run counted 0 calls.

**S8: Docker.**

- `dockerHost` now accepts `https://host:2376`. Client-certificate TLS is not supported; use a TLS-terminating proxy.
- The container query uses a proper `filters=` parameter.
- The implicit global `match` is fixed.
- The README documents a read-only `tecnativa/docker-socket-proxy`, and `group_add` for mounting the socket directly.

**S9: smaller issues.**

- **Guest data leaks.**
  - `GET /api/apps/:id` now hides the status fields from guests.
  - `GET /api/bookmarks` and `/api/bookmarks/:id` require the parent category to be public for guests, using an inner join.
- **Backup import** filters `config` to known keys.
- **Docker images.**
  - The multiarch image is copied in as root and chowns only `data/`, `log/` and `public/`, and gains a HEALTHCHECK.
  - The single-arch image now copies `CHANGELOG.md` (that also fixes B1).
- **k8s `deployment.yaml`.**
  - `runAsNonRoot`, seccomp `RuntimeDefault`, dropped capabilities and no privilege escalation.
  - Resource requests and limits.
  - Liveness and readiness probes on `/health`.
  - `readOnlyRootFilesystem` stays false, because `public/flame.css` is written at runtime.
- **Update check moved to the server.** Viewers' browsers no longer contact GitHub.
  - `GET /api/version/latest` and `/api/version/latest/changelog` cache successes for 6 h and failures for 10 min.
  - They accept only `https:` URLs, cap responses at 256 KB with a 5 s timeout, and allow `?force=1` only when authenticated.

**Test suite.** 106/106 pass (43 existing plus 63 new). The client build succeeds.

---

## Security findings

### S1 HIGH: an SVG icon can run script in the dashboard and steal the admin JWT (verified)

`AppCard`/`BookmarkCard` render `.svg` icons with `<svg data-src=...>`. The `external-svg-loader` library fetches the SVG and **inlines it into the page** with `elem.innerHTML = ...`. Its sanitizer is a blocklist: it removes `<script>`, `on*` attributes and `href="javascript…"`. It does **not** remove `<foreignObject><iframe srcdoc="...">`. A `srcdoc` iframe runs with the dashboard's origin.

Proof of concept (headless Chromium, svg-loader 1.7.1). This SVG:

```xml
<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="10" height="10">
  <iframe srcdoc="&lt;script&gt;parent.document.title='PWNED:'+parent.localStorage.getItem('token')&lt;/script&gt;"></iframe>
</foreignObject></svg>
```

Result: `title = PWNED:FAKE.JWT.TOKEN`. The script read the token from `localStorage`.

**Who can set an SVG icon URL:**

- **The admin.** That alone is low risk. The real issue is that the content behind an external URL can change after the admin adds it, for example a compromised icon host, or a plain-`http://` URL rewritten in transit.
- **Anyone who can label a Docker container** on the host (`flame.icon=https://evil/x.svg`).
- **Anyone who can create an Ingress in *any* namespace** when Kubernetes discovery is on (`flame.pawelmalak/icon`). The ClusterRole reads ingresses cluster-wide. This is the dangerous case in a shared cluster.
- **A backup file someone imports.**

Discovered apps are auto-pinned and public by default. Once the admin opens the homescreen, the injected script reads the JWT from `localStorage`, and the attacker has full admin.

This also defeats the `/uploads` sandbox CSP added in `api.js`. The CSP only applies when the file is navigated to directly. svg-loader fetches the uploaded SVG and injects it into the main document, where that CSP does not apply.

**Fix options, best first:**

1. Render SVG icons as `<img src>` instead of inlining them. Script never runs inside `<img>`. The cost is that `fill="var(--color-primary)"` theming stops working for external SVGs. You can recolour them with a CSS `mask-image` instead.
2. Keep inlining, but run the fetched markup through DOMPurify (`USE_PROFILES: {svg: true, svgFilters: true}`, `FORBID_TAGS: ['foreignObject']`) and inject it yourself.
3. Defence in depth: add a CSP (see S5).

### S2 MEDIUM: a `javascript://` URL runs through the search bar's open-first-result (code-read, regex verified)

`client/src/utility/urlParser.ts` treats anything matching `/^\w+:\/\//` as already having a protocol. So `javascript://%0aalert(1)` is passed through unchanged (I checked the regex in Node).

- **Card clicks are safe.** React 19 rewrites `javascript:` URLs in `href` (I confirmed this in `react-dom-client.production.js`).
- **The search bar is not.** `redirectUrl()` (`SearchBar.tsx:91-114`) calls `document.location.assign()` / `window.open()`, which React does not guard. Typing a local search and pressing Enter opens the first matching app or bookmark, and its URL executes.
- **Sources** are the same as S1: admin, Docker labels, k8s annotations, imported backups.

**Fix:** use an allowlist of schemes in `urlParser`: `http`, `https`, `steam`, plus any you explicitly support. Validate the same allowlist server-side in create, update, sync and import.

### S3 MEDIUM: an unauthenticated user can make `/health` report unhealthy and read the access log (code-read)

`routes/health.js` reads the last 100 lines of `/app/log/access.log` and reports `unhealthy` if 5 or more contain `ERROR` or `Failed`.

- Morgan logs the request URL, so 5 requests to `/ERROR` flip the container to unhealthy. That matters if you run autoheal, a Kubernetes livenessProbe, or an uptime alert on it.
- `?debug=true` is public and returns those raw log lines: client IPs, paths, user-agents.
- The code comment says the log is only present when bind-mounted. In fact morgan always writes it inside the container.

**Fix:** make `/health` check liveness only (process up, DB `SELECT 1`). Move log scanning behind auth or drop it, and remove `debug` from the public route.

### S4 MEDIUM: unauthenticated resource exhaustion (code-read, defaults verified)

- **WebSocket server.** `new WebSocket.Server({ server })` accepts any path, any Origin, no auth, and keeps the `ws` default `maxPayload` of **100 MiB** (verified in `node_modules/ws`). The client only ever receives messages. Set `maxPayload: 1024` and `path: '/socket'`, and consider checking Origin.
- **JSON bodies.** `express.json({ limit: '10mb' })` applies globally, before auth, so every public POST (for example `/api/auth/validate`) parses up to 10 MB. Use a small global limit (~100 kB) and a 10 MB limit only on `/api/backup/import`.

### S5 MEDIUM: no Content-Security-Policy (code-read)

CSP is turned off in `helmet` because icons come from arbitrary URLs. You can still have a useful CSP that allows any image source:

```
script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; img-src * data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https:
```

With `frame-src 'none'`, S1's iframe is blocked. Check `connect-src` against svg-loader's fetches and the update check.

### S6 MEDIUM: tokens cannot be revoked; changing the password doesn't log anyone out (code-read)

- The JWT is signed with `SECRET`, which is independent of `PASSWORD`. Tokens last up to 1 year and are stored in `localStorage`, so S1 or S2 can read them.
- There is no logout on the server, and rotating `PASSWORD` leaves old tokens valid.

**Fix:**

- Include a hash of the password, or a `tokenVersion`, in the JWT and check it in `auth.js`.
- Better: move to an `HttpOnly; SameSite=Strict; Secure` cookie, so script can't read it.
- Pin `algorithms: ['HS256']` in `jwt.verify`.

### S7 MEDIUM: dependency advisories (verified via `npm audit`)

**Server: 19 advisories (3 critical, 8 high).**

- **Reachable at runtime:**
  - `axios` (direct; used for status probes against user-supplied URLs and for the Docker API)
  - `compression` (DoS via a memory leak)
  - `multer` (DoS)
  - `morgan` (log forging)
- **Not reachable at runtime but shipped in the image:**
  - `tar`/`undici` come via `sqlite3 → node-gyp` (build-time).
  - `shell-quote` (critical) comes via **`concurrently`**. `concurrently` is a dev tool but listed under `dependencies`, so it ships in the production image. Move it and `@types/express` to `devDependencies`.
- `proxy-addr` (critical) only applies to subnet-based `trust proxy`, and you use a hop count. Bump it anyway.

**Client: 6 advisories.** These come from `react-router` 7.11 (an open redirect through backslashes in `<Link>`/`useNavigate`, among others). Bump to ≥ 7.18.2.

### S8 LOW–MEDIUM: Docker integration risk (code-read)

- **Unencrypted remote Docker API.** A non-`localhost` `dockerHost` is fetched over plain `http://` with no TLS or auth. An exposed Docker TCP API is root on that host.
- **Raw socket mount.** The README recommends mounting `/var/run/docker.sock`, which is also root-equivalent.
- **Socket may be unusable.** The image runs as `node`, which usually can't read the socket (root:docker 660). So the integration may silently fail unless the user adds `group_add`. I have not tested this.

**Fix:** document a read-only docker-socket-proxy (e.g. `tecnativa/docker-socket-proxy` with `CONTAINERS=1`), the same pattern Homepage and Homarr recommend.

### S9 LOW: smaller issues (code-read)

- **`GET /api/apps/:id` leaks status fields to guests.** It skips the guest redaction that `GET /api/apps` applies, so `statusCheckUrl` (often an internal address) and `status` leak for public apps.
- **`GET /api/bookmarks` ignores the parent category's visibility.** A public bookmark inside a private category is returned to guests.
- **Backup import skips `updateConfig`'s known-key filter.** `restoreConfig` merges *any* keys from the backup into `config.json`. This is authenticated, so the impact is low.
- **The multiarch image hands all of `/app` to the `node` user.** That includes server code, so a file-write bug becomes code execution. Only `data/`, `log/` and `public/flame.css` need to be writable.
- **The k8s manifests set no `securityContext` and no resource limits.** Add `runAsNonRoot`, `readOnlyRootFilesystem` (with emptyDirs for `log/` and `public/`), `allowPrivilegeEscalation: false`, and limits.
- **Every browser tab calls `raw.githubusercontent.com` for the update check.** That reveals the dashboard's IP to GitHub. It would be better done once, server-side.

### Already handled well

I checked these and they are fine:

- Constant-time password comparison
- Login rate limiting, with `TRUST_PROXY` documented
- Token TTL allowlist
- Generated JWT secret
- Weather key masked for guests
- Config key allowlist on update
- Upload filename `basename()`, plus MIME and extension checks and a size cap
- `nosniff` and a sandbox CSP on `/uploads`
- Generic 500 messages in production
- `helmet` defaults
- A non-root container user

---

## Performance findings

### P1 HIGH: the full Material Design Icons set loads whenever any MDI icon is on screen (verified by build)

| Chunk | Raw | Brotli |
|---|---|---|
| `mdi-*.js` | **2,735 kB** | **613 kB** |
| `index-*.js` (app) | 292 kB | 82 kB |
| `vendor-react` | 39 kB | 12.6 kB |
| `vendor-dnd` | 44 kB | 13.4 kB |

Moving `@mdi/js` to a dynamic import took it off the critical path. But almost every dashboard shows at least one MDI icon (the default is `docker`/`cancel`), so the 2.7 MB module is still downloaded *and parsed* on the first visit. Parsing that on a Raspberry Pi or a phone costs real time.

**Fix:** serve only the icons the dashboard uses.

- **Option a:** the server resolves names to path strings. Add `GET /api/icons?names=a,b,c`, backed by `@mdi/js` on the server, and cache the result.
- **Option b:** include `iconPath` in the `/api/apps` and `/api/bookmarks` responses.

The icon picker in Settings can still lazy-load the full set. This should cut the homescreen's JavaScript by about 85%.

### P2 MEDIUM: `/health` reads the whole, never-rotated access log synchronously every 60 s (code-read)

`fs.readFileSync(LOG_PATH)` then `.split('\n').reverse()` reads and splits the *entire* file just to look at 100 lines. `access.log` has no rotation and grows forever. Each health check therefore blocks the event loop for longer and longer, and uses more memory.

**Fix:** drop the log scan (see S3). If you keep it, read only the last ~16 kB with `fs.read` at an offset, and add log rotation (for example `rotating-file-stream`) or document logrotate.

### P3 MEDIUM: Docker/Kubernetes sync runs every minute, unpins everything, and causes UI flicker (code-read)

- **Always running.** `syncApps` runs every 60 s forever. Unlike status checks, it does not pause when nobody is viewing.
- **Unpins every app.** With `unpinStoppedApps` on, each run executes `UPDATE apps SET isPinned=false` across **all** apps, including manually created ones, then re-pins the discovered ones one row at a time, outside a transaction. A homescreen fetch that lands between the two steps sees discovered apps missing. Manually pinned apps get unpinned every minute.
- **Docker and Kubernetes clobber each other.** With both on, the k8s pass unpins the Docker apps.
- **Query is malformed.** `containers/json?{"status":["running"]}` should be `?filters=...`. It happens to work only because the default is running containers.
- **Undeclared global.** `match` in `useDocker.js` is never declared, so it leaks onto the global object.

**Fix:**

- Gate the sync on `isActive()`, like status checks.
- Compute the diff in memory and apply it in one transaction.
- Only unpin apps that came from discovery (add a `source` column).

### P4 MEDIUM: status-check ticks can overlap (code-read)

`setInterval(statusTick, intervalMs)` has no in-flight guard. Each probe can take up to 10 s (5 s HEAD, then a 5 s GET). With concurrency 8, 60+ unreachable apps take longer than the 60 s interval, so runs pile up.

The GET fallback also downloads the **whole response body** (no `maxContentLength`, no stream abort). A status URL pointing at a large file is downloaded in full every tick.

**Fix:**

- Add a `running` flag, or use a self-rescheduling `setTimeout`.
- Use `responseType: 'stream'` and destroy the stream on headers, or set `maxContentLength: 64 * 1024`.

### P5 LOW: client re-renders (code-read)

- **`Home.tsx` subscribes to the whole Redux state** (`useSelector((state) => state)`), so any state change re-renders the homescreen tree. Notifications, the theme, and the 1 s clock if it dispatches are examples. Select only the four slices it uses, with `shallowEqual`.
- **The weather WebSocket has no reconnect.** After a server restart or a proxy idle timeout, weather silently stops updating until the page is reloaded.

### P6 LOW: miscellaneous (code-read)

- **Synchronous file reads per request.** `/api/changelog` and `/api/version` re-read files every request, and themes/queries are read and written with `readFileSync`/`writeFileSync`. This only matters at scale; cache them like `loadConfig`.
- **Reorders aren't transactional.** `reorderApps`/`reorderBookmarks` issue N separate `UPDATE`s. Wrap them in one transaction, which is also faster on SQLite.
- **Uncached cards across reloads.** svg-loader caches each external SVG in `localStorage` for 30 days, but the PNG/JPG paths get no client-side caching across reloads. Fine as is.

---

## Functional bugs found along the way (code-read)

- **B1: `/api/changelog` returns 500 in the single-arch image.** `.docker/Dockerfile` never copies `CHANGELOG.md` (the multiarch image does, via `COPY . .`).
- **B2: imported custom CSS is lost on restart.** `restore.js` writes only `public/flame.css`. On startup `initFiles` copies `data/flame.css` over it, reverting to the pre-import CSS. `updateCSS` copies the file to `data/`; import should too.
- **B3: setting a weather API key needs a restart.** `jobs.js` only schedules the weather job if a key exists at startup.
- **B4: categories with no public bookmarks 404 for guests.** `GET /api/categories/:id` uses an inner-join include with `where: visibility`, so a category with no *public* bookmarks returns 404 for guests.
- **B5: `/settings/*` isn't wrapped in `ProtectedRoute`.** Presumably that's intentional so guests can see the About and theme pages. The server enforces auth on writes, so this is UX only.

---

## Feature comparison (researched 2026-10-10)

**How this was researched.** A research agent used web search and fetched project pages. GitHub's API was unreachable from this session, so star counts are approximate. Items marked (u) are unverified.

**Context.**

- **Homarr is now on v2.x.** v2.4.1 shipped on 10 Oct 2026.
- **Upstream Flame was revived.** v2.4.0 shipped on 24 Apr 2026, and a v3 rewrite has been announced.
- **Two 2026 CVEs were reported against upstream Flame.** Both are sourced only from aggregator sites, so check the official records before citing them:
  - **CVE-2026-100501:** no login rate limit. *Revamped already mitigates this* with `express-rate-limit`.
  - **CVE-2026-100502:** long-lived tokens survive a password change. *Revamped still has this* (see S6), although its TTL allowlist caps lifetimes at 1 year.

| Feature | **Flame-Revamped 1.7.1** | Homepage | Homarr v2 | Dashy 4 | Glance | Homer | Heimdall |
|---|---|---|---|---|---|---|---|
| Config model | GUI | YAML + labels | GUI | YAML + in-app editor | YAML | YAML | GUI |
| Auth | Single password, public/private items | Opt-in password/OIDC | Users, groups, OIDC, LDAP | Users, OIDC, Keycloak, header, guest | Users (same dashboard for all) | None | Users (u) |
| Service API widgets | **None** | 100+ (keys proxied) | 80+ | 92 | ~28 types + custom API | 52 cards | "Enhanced apps" |
| Health checks | **Yes (HTTP up/down)** | Yes | Yes (u) | HTTP + ICMP + latency | Monitor widget | Ping | No (u) |
| Docker discovery | Labels, remote host | Labels + container stats | Multi-host Docker/Podman | No | Containers widget | Socket proxy card | No |
| Kubernetes discovery | **Yes (ingress)** | Yes | Helm only | No | No | No | No |
| Drag-and-drop layout | **Yes** | No | Yes | Partial | No | No | Ordering (u) |
| Web search / bangs | 11 providers + custom prefixes | Widget | Integration search | Engines + bangs | Widget + bangs (u) | Local only | Yes |
| Bookmarks | Yes | Yes | Yes (u) | Yes | Yes | No | No |
| Weather | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Calendar / RSS | No / No | Yes (u) / No (u) | Yes (u) / Yes (u) | Yes / Yes | Yes / Yes (+Reddit, HN, YouTube) | No / Yes | No / No |
| System stats (CPU/RAM/disk) | No | Yes (+ Glances) | Yes | 16 widgets | Yes | Glances card | No |
| Multiple pages / tabs | No | Tabs (u) | Multiple boards | Multi-page | Unlimited pages | Hash pages | No |
| i18n | No | 40+ | Crowdin | ~35 | No | No | 22+ |
| Backup / import | **Full JSON export/import** | Copy YAML | Import/export (u) | Cloud backup | Copy YAML | Copy YAML | Pinned-item import/export |
| Footprint | Node + SQLite, ~3 MB JS | Next.js | Redis-backed (heavier) | ~1 GB RAM recommended | <20 MB Go binary | Static | PHP |

### Where Revamped stands

- **Ahead of most:**
  - GUI editing with drag-and-drop *and* Kubernetes ingress discovery. Only Homepage also does Kubernetes, and it is YAML-driven.
  - Built-in HTTP health dots.
  - A real JSON backup/restore.
  - Guest vs. admin visibility per item.
- **Biggest gaps, in rough order of user demand:**
  1. **Service widgets with server-side API key proxying.** This is the defining feature of Homepage, Homarr and Dashy. Start with a generic "custom API" widget (Glance-style JSONPath) plus Pi-hole/AdGuard, *arr, Jellyfin/Plex and Proxmox.
  2. **OIDC / forward-auth header support.** At minimum, trust `Remote-User` from Authelia/Authentik behind a flag. Multiple users can come later.
  3. **System stats.** CPU, RAM and disk for the host, or a Glances passthrough.
  4. **Multiple pages or tabs.**
  5. **Calendar and RSS widgets.**
  6. **i18n.**
- **Fix first:** S1 and S2 become *more* important as integrations are added. Any feature that pulls third-party content (widgets, RSS, icons) widens the same XSS surface. Fixing them before adding widgets is cheaper.

Sources: the GitHub repos and release pages of gethomepage/homepage, homarr-labs/homarr, Lissy93/dashy, glanceapp/glance, bastienwirtz/homer, linuxserver/Heimdall, causefx/Organizr, revenz/Fenrus and pawelmalak/flame. Also NVD CVE-2024-42364, and opencve.io / thehackerwire for the 2026 Flame CVEs.
