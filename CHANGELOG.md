### Unreleased
Dependency modernization, part 1 (safe bumps). The full plan and the source of each build warning are in [docs/DEPENDENCY_MODERNIZATION.md](docs/DEPENDENCY_MODERNIZATION.md).

- Server: express 5.3.0, express-rate-limit 8.7.1, express-static-gzip 3.0.2, helmet 8.3.0, ws 8.22.0.
- Client: react / react-dom 19.3.0, @types/react / @types/react-dom 19.3.0, @types/node 24.19, prettier 3.9.
- Removed unused client packages: `react-jwt`, `cross-env`, `@types/react-redux`, `@types/react-router-dom` (react-redux and react-router ship their own types).
- Replaced umzug with a small built-in migration runner (`db/migrator.js`). It uses the same `SequelizeMeta` table, so existing databases carry on unchanged, and a database migrated by this version still works with v1.8.0. This removes the `lodash.get` and `lodash.isequal` build warnings and the 4 moderate `sprintf-js` advisories that S7 had accepted. `npm audit` on the server is now clean.
- Docker images and CI now run on Node 24 (the current LTS), up from Node 22. `engines.node` is now `>=22.12.0`, since Node 20 reached end of life in April 2026. The multiarch image compiles sqlite3 with node-gyp directly instead of using the `--build-from-source` flag, which npm 11 deprecates.
- Client: @redux-devtools/extension 4 (same `composeWithDevTools` API, now ESM-only).
- Client build: `vite-plugin-compression` (unmaintained since 2022) is replaced by `vite-plugin-compression2`, with the same max-level gzip and brotli settings. The .gz and .br files are byte-for-byte the same size as before.
- axios is gone from both the server and the client. Both now use the built-in `fetch`, the client through a small `utility/http.ts` wrapper that keeps the same `{ data }` / `err.response.data` shape. The local Docker socket is read with `node:http`, since fetch can't use unix sockets. One behavior change: axios honored `HTTP_PROXY`/`HTTPS_PROXY` and Node's fetch does not by default. If Flame reaches the weather API or the update check through a proxy, set `NODE_USE_ENV_PROXY=1` as well.
- `npm run dev-server` now uses Node's built-in `node --watch` instead of nodemon. This clears the 3 high `npm audit` findings (braces via nodemon's chokidar). Dev only, the Docker image is unaffected.

### v1.8.0 (2026-10-10)
Security, performance and bug-fix release. Full findings and verification notes are in [docs/SECURITY_PERFORMANCE_REVIEW.md](docs/SECURITY_PERFORMANCE_REVIEW.md).

**Upgrade notes**
- Everyone has to log in once after upgrading. Tokens are now bound to the admin password, and older tokens carry no fingerprint, so they are rejected.
- A Content-Security-Policy is now on by default. If a custom setup breaks, `CSP=off` turns it off and logs a warning.
- Migration `08_app-source` adds an `apps.source` column. It runs automatically on startup.

**Security**
- Fixed an XSS through SVG icons (S1). `external-svg-loader` is replaced by `SafeSvgIcon`, which sanitizes each SVG with DOMPurify before inserting it.
- Blocked dangerous URL schemes (`javascript`, `vbscript`, `data`, `blob`, `file`) in apps, bookmarks, Docker/Kubernetes discovery, backup import and the search bar's open-first-result (S2).
- `/health` is now a cheap liveness check. It no longer reads `access.log`, can't be made to report unhealthy by unauthenticated requests, and no longer leaks the log (S3/P2).
- Capped WebSocket payloads (1 KB, `/socket` only) and the size of unauthenticated JSON bodies (100 KB; backup import keeps 10 MB) (S4).
- Added a Content-Security-Policy via helmet (S5).
- Tokens are bound to the admin password (keyed `pwf` fingerprint claim) and the JWT algorithm is pinned to HS256, so changing `PASSWORD` invalidates every previously issued token (S6).
- Resolved dependency advisories: client 0; server 4 moderate in `sprintf-js` via umzug's CLI, which Flame never runs, so they are accepted (S7).
- Docker integration: `dockerHost` accepts `https://host:2376`, the container query is fixed, and the README documents a read-only socket proxy (S8).
- Closed guest data leaks in `GET /api/apps/:id` and bookmarks inside private categories. Backup import now filters config to known keys (S9).
- Least-privilege images: only `data/`, `log/` and `public/` are writable by `node`, and the multiarch image has a HEALTHCHECK. The k8s manifests set a security context, resource limits and probes (S9).
- The update check now runs on the server with caching, so viewers' browsers no longer contact GitHub (S9).
- Fixed a crash where one malformed WebSocket frame, sent unauthenticated, killed the server (S10).

**Performance**
- The homescreen no longer loads the full Material Design Icons set. Icon paths come with the apps and categories responses, and `GET /api/icons` serves any others. Homescreen JS went from 759 KB to about 114 KB (P1).
- Docker/Kubernetes sync is paused while nobody is viewing, applies changes in one transaction, and only unpins apps it discovered itself, so manually added apps stay pinned and the homescreen no longer flickers (P3).
- Status checks can't overlap, and probes stop reading as soon as headers arrive (P4).
- The homescreen re-renders less, and the weather socket reconnects after a server restart (P5).
- Static files are cached, and reorders run in one transaction (P6).
- Smaller bundles: DOMPurify, skycons and the drag-and-drop grids load lazily (guests never download dnd-kit), and `react-dom` is in the cached vendor chunk.
- Admins no longer fetch apps and bookmarks twice on load.

**Fixes**
- `/api/changelog` no longer returns 500 in the single-arch image (B1).
- Imported custom CSS survives a restart (B2).
- Setting a weather API key takes effect without a restart (B3).
- Categories with no public bookmarks no longer 404 for guests (B4).
- Icon URLs on hosts without a dot (for example `http://nas/icon.png`) are no longer treated as uploads.

### v1.7.1 (2026-06-25)
- Fixed mobile/touch dashboards being unscrollable: the homescreen app and bookmark grids set `touch-action: none` on every pinned card, so touching a card (which fills the single-column mobile viewport) gave the browser nowhere to start a scroll, and the `PointerSensor`'s 8px drag threshold turned any swipe into a reorder. Cards now use `touch-action: pan-y`, and the grids use a `MouseSensor` (desktop, unchanged 8px threshold) plus a `TouchSensor` with a 200ms press-and-hold activation. A quick swipe now scrolls; a press-and-hold then drag reorders — the standard mobile rearrange gesture. Desktop mouse/keyboard reordering is unchanged.

### v1.7.0 (2026-06-06)
- Added a configurable **dashboard width** (Settings → Interface → Layout). The page container is now a percentage-based, centered width driven by a `--dashboard-width` CSS variable instead of a fixed 250px side padding, which had squeezed the grid inward when zooming in (`Ctrl +`) on large screens. Default 75%.
- Added configurable **grid column counts** for the applications and bookmarks grids (separate settings, next to dashboard width). The wide-screen (≥900px) column count is user-set; narrower breakpoints ramp down and are capped at the setting so smaller screens never show more columns than configured. Defaults of 4/4 reproduce the previous layout.
- Both settings thread through the existing config pipeline (`initialConfig.json` allow-list, so `initConfig` migrates existing `config.json` on startup) and are applied as CSS variables on load, mirroring the theme system.

### v1.6.4 (2026-06-06)
- Security: cleared the High-severity node-tar advisories (CVE-2026-23745, CVE-2026-23950, CVE-2026-31802 — symlink/hardlink path traversal and a Unicode-collision extraction race) flagged in Docker Hub image scans. `tar` reached the image only as an install-time transitive dependency of sqlite3 5.1.7 (the EOL tar 6.x line, which is not backported); bumping **sqlite3 5.1.7 => 6.0.1** moves the chain onto the patched **tar 7.5.16** (via node-gyp 12) with no overrides. sqlite3 is consumed only through Sequelize, so there is no application API change.
- Security: overrode **uuid => ^11.1.1** to clear the moderate CVE-2026-41907 (missing buffer bounds check in v3/v5/v6) pulled in transitively via Sequelize; `npm audit` is now clean. Verified Sequelize UUID generation still works on uuid 11.
- The multi-arch image now compiles **sqlite3 from source** (`--build-from-source=sqlite3`). sqlite3 6.0.1's published linux prebuilt is linked against glibc 2.38, newer than the `node:22-bookworm-slim` runtime's 2.36, which crashed the container at boot (`GLIBC_2.38 not found`, `ERR_DLOPEN_FAILED`); the from-source build links the runtime's own glibc. Validated end-to-end via `buildx`: both linux/amd64 and linux/arm64 images build and boot to `/health` 200 with all migrations applied.
- Added an `engines` floor of Node >=20.17.0 (required by sqlite3 6; the Docker images already run Node 22).

### v1.6.0 (2026-06-05)
- Removed all references to the upstream `spiicytuna` fork across the README, dev build scripts, and docs; image/clone instructions now point at `AlexStapleton/Flame-Revamped` and the `alexstapo/flame-revamped` Docker Hub image. Fixed the Kubernetes ingress label examples to the `flame.pawelmalak/*` namespace the code actually reads.
- Dependency major bumps (Vite 8, TypeScript 6, sqlite3 6, docker-secret 2, @redux-devtools/extension 4, @types/node 25) were attempted but **deferred** — they broke the multi-arch Docker build (Vite 8's native rolldown bindings fail `npm ci` under Alpine/musl; sqlite3 6's arm64 stage is unvalidated). The dependency tree in this release is unchanged from v1.5.1; the bumps will return on a dedicated branch validated against a Linux-built lockfile and a live `buildx` run.

### v1.5.1 (2026-06-05)
- Fixed the update checker to track this fork (AlexStapleton/Flame-Revamped, `main`) instead of the upstream repo it was branched from — the App Version panel now reports this fork's releases.
- Unified the app version onto this fork's v1.x release line (was 2.4.3). Entries below v1.5.0 use the prior 2.x app-version lineage inherited from upstream Flame.
- Bumped CI/publish GitHub Actions to Node 24-compatible versions.
- Updated server dependencies: axios 1.16.1 => 1.17.0, umzug 3.8.2 => 3.8.3, @types/express 4 => 5, concurrently 6 => 10.
- Updated client dependencies: react/react-dom 19.2.5 => 19.2.7, react-redux 9.2.0 => 9.3.0, react-router-dom 7.16.0 => 7.17.0, vite 7.3.2 => 7.3.5, @types/react 19.2.14 => 19.2.17, @types/node 24.12.2 => 24.13.1.
- Held back majors pending dedicated testing: sqlite3 6 and docker-secret 2 (native/runtime — need multi-arch build validation); Vite 8 + React/SVGR plugins and TypeScript 6 (Vite's rolldown bundler migration).

### v1.5.0 (2026-06-05)
- Added config/data import & export — one-click Backup & Restore in Settings (apps, bookmarks, categories, config, themes, queries, custom CSS), with a pre-import safety snapshot. Secrets (weather API key) are excluded from exports.

### v2.4.3 (2025-12-20)
- Updated axios 1.11.0 => 1.13.2
- Updated dotenv 10.0.0 => 17.2.3
- Updated express 4.17.1 => 5.2.1
- Updated jsonwebtoken 9.0.2 => 9.0.3
- Updated nodemon 3.1.10 => 3.1.11
- Updated prettier 3.6.2 => 3.7.4
- Updated react 19.1.1 => 19.2.3

### v2.4.2 (2025-09-15)
- Updated prettier v2.4.1 => 3.6.2
- Updated skycons-ts v0.2.0 => 1.0.0 (animated weather icons)
- Updated sequelize v6.37.7 => 6.9.0
- Updated sqlite3 v5.0.2 => 5.1.7 
- Updated umzug v2.3.0 => 3.8.2
- Minor update to database migration tool to support umzug 3.8.2 along with logging output to console

### v2.4.1 (2025-09-09)
- Updated nodemon 2.0.14 => 3.1.10 (security/vulnerability)
- Updated @types/node 16.11.6 => 24.3.1 (security/vulnerability)
- Updated redux-devtools-extension (requires Redux 3) => @redux-devtools/extension (Redux 5 and beyond)
- Updated codebase to remove extinct react-beautiful-dnd for @dnd-kit (security/vulnerability)

### v2.4.0 (2025-09-06)
- Fixed secure route blocking logging in via settings
- Fixed hardcoded JWT key (issue from orig repo: pawelmalak[#465](https://github.com/pawelmalak/flame/issues/465))
- Updated mdi icons to newest version 7.4.xx
- Complete security overhaul since 2023 update on original repo

### v2.3.1 (2023-07-23)
- Fixed bug where "Open search results in the same tab" setting was not respected if "Local search" was set as primary search provider ([#270](https://github.com/pawelmalak/flame/issues/270))
- Fixed bug where search bar had rounded input field on iOS ([#394](https://github.com/pawelmalak/flame/issues/394))
- Updated link to Material Design Icons reference page ([#414](https://github.com/pawelmalak/flame/issues/414))
- Fixed bug where color inputs in theme creator/editor were too small ([#429](https://github.com/pawelmalak/flame/issues/429))
- Changed input labels in settings for more consistent naming ([#430](https://github.com/pawelmalak/flame/issues/430))

### v2.3.0 (2022-03-25)
- Added custom theme editor ([#246](https://github.com/pawelmalak/flame/issues/246))
- Added option to set secondary search provider ([#295](https://github.com/pawelmalak/flame/issues/295))
- Fixed bug where pressing Enter with empty search bar would redirect to search results ([#325](https://github.com/pawelmalak/flame/issues/325))
- Fixed bug where user could create empty app or bookmark which was causing page to go blank ([#332](https://github.com/pawelmalak/flame/issues/332))
- Added new theme: Mint

### v2.2.2 (2022-03-21)
- Added option to get user location directly from the app ([#287](https://github.com/pawelmalak/flame/issues/287))
- Fixed bug with local search not working when using prefix ([#289](https://github.com/pawelmalak/flame/issues/289))
- Fixed bug with app description not updating when using custom icon ([#310](https://github.com/pawelmalak/flame/issues/310))
- Changed permissions to some files and directories created by Flame
- Changed some of the settings tabs

### v2.2.1 (2022-01-08)
- Local search will now include app descriptions ([#266](https://github.com/pawelmalak/flame/issues/266))
- Fixed bug with unsupported characters in local search [#279](https://github.com/pawelmalak/flame/issues/279))
- Background tasks optimization ([#283](https://github.com/pawelmalak/flame/issues/283))

### v2.2.0 (2021-12-17)
- Added option to set custom description for apps ([#201](https://github.com/pawelmalak/flame/issues/201))
- Fixed fatal error while deploying Flame to cluster ([#242](https://github.com/pawelmalak/flame/issues/242))

### v2.1.1 (2021-12-02)
- Added support for Docker secrets ([#189](https://github.com/pawelmalak/flame/issues/189))
- Changed some messages and buttons to make it easier to open bookmarks editor ([#239](https://github.com/pawelmalak/flame/issues/239))

### v2.1.0 (2021-11-26)
- Added option to set custom order for bookmarks ([#43](https://github.com/pawelmalak/flame/issues/43)) and ([#187](https://github.com/pawelmalak/flame/issues/187))
- Added support for .ico files for custom icons ([#209](https://github.com/pawelmalak/flame/issues/209))
- Empty apps and categories sections will now be hidden from guests ([#210](https://github.com/pawelmalak/flame/issues/210))
- Fixed bug with fahrenheit degrees being displayed as float ([#221](https://github.com/pawelmalak/flame/issues/221))
- Fixed bug with alphabetical order not working for bookmarks until the page was refreshed ([#224](https://github.com/pawelmalak/flame/issues/224))
- Added option to change visibilty of apps, categories and bookmarks directly from table view
- Password input will now autofocus when visiting /settings/app

### v2.0.1 (2021-11-19)
- Added option to display humidity in the weather widget ([#136](https://github.com/pawelmalak/flame/issues/136))
- Added option to set default theme for all new users ([#165](https://github.com/pawelmalak/flame/issues/165))
- Added option to hide header greetings and date separately ([#200](https://github.com/pawelmalak/flame/issues/200))
- Fixed bug with broken basic auth ([#202](https://github.com/pawelmalak/flame/issues/202))
- Fixed bug with parsing visibility value for apps and bookmarks when custom icon was used ([#203](https://github.com/pawelmalak/flame/issues/203))
- Fixed bug with custom icons not working with apps when "pin by default" was disabled

### v2.0.0 (2021-11-15)
- Added authentication system:
  - Only logged in user can access settings ([#33](https://github.com/pawelmalak/flame/issues/33))
  - User can set which apps, categories and bookmarks should be available for guest users ([#45](https://github.com/pawelmalak/flame/issues/45))
  - Visit [project wiki](https://github.com/pawelmalak/flame/wiki/Authentication) to read more about this feature
- Docker images will now be versioned ([#110](https://github.com/pawelmalak/flame/issues/110))
- Icons can now be set via URL ([#138](https://github.com/pawelmalak/flame/issues/138))
- Added current time to the header ([#157](https://github.com/pawelmalak/flame/issues/157))
- Fixed bug where typing certain characters in the search bar would result in a blank page ([#158](https://github.com/pawelmalak/flame/issues/158))
- Fixed bug with MDI icon name not being properly parsed if there was leading or trailing whitespace ([#164](https://github.com/pawelmalak/flame/issues/164))
- Added new shortcut to clear search bar and focus on it ([#170](https://github.com/pawelmalak/flame/issues/170))
- Added Wikipedia to search queries
- Updated project wiki
- Lots of changes and refactors under the hood to make future development easier

### v1.7.4 (2021-11-08)
- Added option to set custom greetings and date ([#103](https://github.com/pawelmalak/flame/issues/103))
- Fallback to web search if local search has zero results ([#129](https://github.com/pawelmalak/flame/issues/129))
- Added iOS "Add to homescreen" icon ([#131](https://github.com/pawelmalak/flame/issues/131))
- Added experimental script to import bookmarks ([#141](https://github.com/pawelmalak/flame/issues/141))
- Added 3 new themes

### v1.7.3 (2021-10-28)
- Fixed bug with custom CSS not updating

### v1.7.2 (2021-10-28)
- Pressing Enter while search bar is focused will now redirect to first result of local search ([#121](https://github.com/pawelmalak/flame/issues/121))
- Use search bar shortcuts when it's not focused ([#124](https://github.com/pawelmalak/flame/issues/124))
- Fixed bug with Weather API still logging with module being disabled ([#125](https://github.com/pawelmalak/flame/issues/125))
- Added option to disable search bar autofocus ([#127](https://github.com/pawelmalak/flame/issues/127))

### v1.7.1 (2021-10-22)
- Fixed search action not being triggered by Numpad Enter
- Added option to change date formatting ([#92](https://github.com/pawelmalak/flame/issues/92))
- Added shortcuts (Esc and double click) to clear search bar ([#100](https://github.com/pawelmalak/flame/issues/100))
- Added Traefik integration ([#102](https://github.com/pawelmalak/flame/issues/102))
- Fixed search bar not redirecting to valid URL if it starts with capital letter ([#118](https://github.com/pawelmalak/flame/issues/118))
- Performance improvements

### v1.7.0 (2021-10-11)
- Search bar will now redirect if valid URL or IP is provided ([#67](https://github.com/pawelmalak/flame/issues/67))
- Users can now add their custom search providers ([#71](https://github.com/pawelmalak/flame/issues/71))
- Fixed bug related to creating new apps/bookmarks with custom icon ([#83](https://github.com/pawelmalak/flame/issues/83))
- URL can now be assigned to notifications. Clicking on "New version is available" popup will now redirect to changelog ([#86](https://github.com/pawelmalak/flame/issues/86))
- Added static fonts ([#94](https://github.com/pawelmalak/flame/issues/94))
- Fixed bug with overriding app icon created with docker labels

### v1.6.9 (2021-10-09)
- Added option for remote docker host ([#97](https://github.com/pawelmalak/flame/issues/97))

### v1.6.8 (2021-10-05)
- Implemented migration system for database

### v1.6.7 (2021-10-04)
- Add multiple labels to Docker Compose ([#90](https://github.com/pawelmalak/flame/issues/90))
- Custom icons via Docker Compose labels ([#91](https://github.com/pawelmalak/flame/issues/91))

### v1.6.6 (2021-09-06)
- Added local search (filter) for apps and bookmarks ([#47](https://github.com/pawelmalak/flame/issues/47))

### v1.6.5 (2021-08-28)
- Added support for more URL schemes ([#74](https://github.com/pawelmalak/flame/issues/74))

### v1.6.4 (2021-08-17)
- Added Kubernetes integration ([#72 continued](https://github.com/pawelmalak/flame/issues/72))

### v1.6.3 (2021-08-09)
- Added support for custom SVG icons ([#73](https://github.com/pawelmalak/flame/issues/73))
- Added Deezer and Tidal to search queries

### v1.6.2 (2021-08-06)
- Fixed changelog link
- Added support for Docker API ([#14](https://github.com/pawelmalak/flame/issues/14))

### v1.6.1 (2021-07-28)
- Added option to upload custom icons for bookmarks ([#52](https://github.com/pawelmalak/flame/issues/52))
- Fixed custom icons not updating ([#58](https://github.com/pawelmalak/flame/issues/58))
- Added changelog file

### v1.6.0 (2021-07-17)
- Added support for Steam URLs ([#62](https://github.com/pawelmalak/flame/issues/62))
- Fixed bug with custom CSS not persisting ([#64](https://github.com/pawelmalak/flame/issues/64))
- Added option to set default prefix for search bar ([#65](https://github.com/pawelmalak/flame/issues/65))

### v1.5.0 (2021-06-24)
- Added ability to set custom CSS from settings ([#8](https://github.com/pawelmalak/flame/issues/8) and [#17](https://github.com/pawelmalak/flame/issues/17)) (experimental)
- Added option to upload custom icons ([#12](https://github.com/pawelmalak/flame/issues/12))
- Added option to open links in a new or the same tab ([#27](https://github.com/pawelmalak/flame/issues/27))
- Added Search bar with support for 3 search engines and 4 services ([#44](https://github.com/pawelmalak/flame/issues/44))
- Added option to hide applications and categories ([#48](https://github.com/pawelmalak/flame/issues/48))
- Improved Logger

### v1.4.0 (2021-06-18)
- Added more sorting options. User can now choose to sort apps and categories by name, creation time or to use custom order ([#13](https://github.com/pawelmalak/flame/issues/13))
- Added reordering functionality. User can now set custom order for apps and categories from their 'edit tables' ([#13](https://github.com/pawelmalak/flame/issues/13))
- Changed get all controllers for applications and categories to use case-insensitive ordering ([#36](https://github.com/pawelmalak/flame/issues/36))
- New apps will be placed correctly in the array depending on used sorting settings ([#37](https://github.com/pawelmalak/flame/issues/37))
- Added app version to settings with option to check for updates manually ([#38](https://github.com/pawelmalak/flame/issues/38))
- Added update check on app start ([#38](https://github.com/pawelmalak/flame/issues/38))
- Fixed bug with decimal input values in Safari browser ([#40](https://github.com/pawelmalak/flame/issues/40))

### v1.3.0 (2021-06-14)
- Added reverse proxy support ([#23](https://github.com/pawelmalak/flame/issues/23) and [#24](https://github.com/pawelmalak/flame/issues/24))
- Added support for more url formats ([#26](https://github.com/pawelmalak/flame/issues/26))
- Added ability to hide main header ([#28](https://github.com/pawelmalak/flame/issues/28))
- Fixed settings not being synchronized ([#29](https://github.com/pawelmalak/flame/issues/29))
- Added auto-refresh for greeting and date ([#34](https://github.com/pawelmalak/flame/issues/34))

### v1.2.0 (2021-06-10)
- Added simple check to the weather module settings to inform user if the api key is missing ([#2](https://github.com/pawelmalak/flame/issues/2))
- Added ability to set optional icons to the bookmarks ([#7](https://github.com/pawelmalak/flame/issues/7))
- Added option to pin new applications and categories to the homescreen by default ([#11](https://github.com/pawelmalak/flame/issues/11))
- Added background highlight while hovering over application card ([#15](https://github.com/pawelmalak/flame/issues/15))
- Created CRON job to clear old weather data from the database ([#16](https://github.com/pawelmalak/flame/issues/16))
- Added proxy for websocket instead of using hard coded host ([#18](https://github.com/pawelmalak/flame/issues/18))
- Fixed bug with overwriting opened tabs ([#20](https://github.com/pawelmalak/flame/issues/20))

### v1.1.0 (2021-06-09)
- Added custom favicon and changed page title ([#3](https://github.com/pawelmalak/flame/issues/3))
- Added functionality to set custom page title ([#3](https://github.com/pawelmalak/flame/issues/3))
- Changed messages on the homescreen when there are apps/bookmarks created but not pinned to the homescreen ([#4](https://github.com/pawelmalak/flame/issues/4))
- Added 'warnings' to apps and bookmarks forms about supported url formats ([#5](https://github.com/pawelmalak/flame/issues/5))

### v1.0.0 (2021-06-08)
Initial release of Flame - self-hosted startpage using Node.js on backend and React on frontend.
