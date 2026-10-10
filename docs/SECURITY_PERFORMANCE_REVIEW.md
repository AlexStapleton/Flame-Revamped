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
| S1 | SVG icon XSS via `external-svg-loader` | _in progress_ |
| S2 | `javascript://` URLs via search-bar redirect | _in progress_ |
| S3 / P2 | `/health` log scan: spoofable, leaks the log, slow | _in progress_ |
| S7 | Dependency advisories | _in progress_ |
| S4, S5, S6, S8, S9 | Remaining security items | Open |
| P1, P3–P6, B1–B5 | Performance items and functional bugs | Open |

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
