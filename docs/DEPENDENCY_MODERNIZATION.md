# Dependency modernization plan (after v1.8.0)

Checked on 2026-10-10 against `main` at a3d5726, Node 22.22 / npm 10.9 (same as the Docker build stage).
Baseline before any change: server tests 155/155 pass, client `vite build` succeeds.

## 1. Where the four build warnings come from

Traced with `npm ls <pkg> --all` on a clean `npm ci --omit=dev` (the same install the Dockerfile runs).

| Warning | Pulled in by | Can we remove it? |
|---|---|---|
| `dottie@2.0.7` | `sequelize@6.37.8` (already the latest stable) | Not without Sequelize 7, which is still alpha (7.0.0-alpha.48). **Leave it.** |
| `lodash.get@4.4.2` | `umzug@3.8.3` → `@rushstack/ts-command-line@4.19.1` (pinned exactly) → `@rushstack/terminal` → `@rushstack/node-core-library` → `z-schema@5.0.5` | **Yes**, by dropping umzug (see B1). |
| `lodash.isequal@4.5.0` | same chain as `lodash.get` | **Yes**, same fix. |
| `prebuild-install@7.1.3` | `sqlite3@6.0.1` (already the latest) | Not today. It only downloads the prebuilt SQLite binary at install time, and Sequelize 6 only supports the `sqlite3` driver. **Leave it**, revisit when sqlite3 ships a release without it. |

The coordinator's earlier guesses were right for dottie and prebuild-install; the two lodash packages come from umzug, not Sequelize.

## 2. Security audit (`npm audit`)

- **Server, production deps (what ships in the image): 4 moderate.** All one chain: `sprintf-js` (DoS, GHSA-hp3w-g68c-fv3c, no fixed version exists) ← `argparse@1` ← `@rushstack/ts-command-line` ← `umzug`. Even the newest rushstack still uses argparse 1, so an override can't fix it. Flame only uses umzug's programmatic runner (`db/index.js`), never its CLI, which is what drags all this in.
- **Server, dev deps: 3 high.** `braces` ← `chokidar@3` ← `nodemon@3.1.14` (already latest). Dev-only, not in the image.
- **Client: 0 vulnerabilities.**

## 3. Outdated packages (`npm outdated`)

Server: express 5.2.1→5.3.0, express-rate-limit 8.5.2→8.7.1, express-static-gzip 3.0.1→3.0.2, helmet 8.2.0→8.3.0, ws 8.21.0→8.22.0 (all in-range). Majors: @kubernetes/client-node 1.4→2.0, docker-secret 1.2→2.0, dotenv 17→18.

Client: react / react-dom 19.2.7→19.3.0, @types/react(-dom) →19.3.0, @types/node 24.13→24.19, prettier 3.8→3.9 (all in-range). Majors: vite 7→8, @vitejs/plugin-react 5→6, vite-plugin-svgr 4→5, @redux-devtools/extension 3→4, typescript 5.9→7.0, @types/node 24→26.

Unused / stale (checked by grepping `client/src`): `react-jwt` (0 imports), `cross-env` (no script uses it), `@types/react-redux` and `@types/react-router-dom` (both libraries ship their own types; the router one is for v5). `vite-plugin-compression` has had no release since 2022.

## 4. Proposed PRs, grouped by risk

### A. Safe bumps, one PR (default: I do this now)
- All in-range server and client bumps listed above, plus a lockfile refresh.
- Remove `react-jwt`, `cross-env`, `@types/react-redux`, `@types/react-router-dom`.
- Replace `nodemon` with Node's built-in `node --watch` for `npm run dev-server`. Clears the 3 high dev findings. Dev workflow only, nothing in the image changes.

### B. Low-to-medium risk, recommended, one PR each
- **B1. Replace umzug with a small built-in migration runner.** About 50 lines, reading and writing the same `SequelizeMeta` table umzug uses, so existing databases see no change. Removes the `lodash.get` and `lodash.isequal` warnings and all 4 production audit findings. Medium risk because it touches startup migrations; covered by the existing migrations test plus new tests that run it against a database created by the old umzug runner.
- **B2. Docker base image `node:22-alpine` → `node:24-alpine`.** Node 24 is the current LTS; 22 is in maintenance until April 2027. sqlite3 gets a fresh native build. CI node-version moves with it.
- **B3. `vite-plugin-compression` → `vite-plugin-compression2`.** Same .gz/.br output, maintained package.

### C. Major upgrades with breaking changes, one PR each, Alex picks
- **C1. Vite 8 + @vitejs/plugin-react 6 + vite-plugin-svgr 5** (they move together). Vite 8 switches the bundler to Rolldown, so the `manualChunks` vendor splitting in `client/vite.config.ts` needs re-checking and the bundle sizes from the PR #22 perf report should be re-measured.
- **C2. @kubernetes/client-node 2.0.** ESM-only; Flame already loads it with dynamic `import()` in `controllers/apps/docker/useKubernetes.js`, so the main risk is API changes in the ingress listing. Only testable if you run Flame on Kubernetes.
- **C3. dotenv 18 and docker-secret 2.** Each is used in one place (`server.js`, `utils/init/initDockerSecrets.js`). Changelogs not yet checked.
- **C4. @redux-devtools/extension 4.** ESM-only, one import in `client/src/store/store.ts`. Small.
- **C5. TypeScript 7.** Nothing in the build type-checks today (Vite strips types), and `tsc --noEmit` currently reports 123 errors, so the TS version only affects your editor. Recommend holding at 5.9 unless you want a separate "fix the type errors" PR first.
- **C6. axios → fetch.** Server: 4 files. Client: 8 files, 29 calls, no interceptors. Removes axios from both sides. Deferred from 1.8 as agreed.

### Not recommended now
- Sequelize 7 (alpha) or a different ORM just to drop `dottie`.
- Swapping sqlite3 for another driver to drop `prebuild-install` (Sequelize 6 doesn't support one).

## 5. How each PR gets checked
Full server test suite and `npm run build` in the client before every push. Then a manual `docker-publish` run with the `:dev` tag for you to test (never `latest` or a version tag). I won't merge anything without your go-ahead.

## 6. Outcome (2026-10-10, all nine upgrades)

Alex chose "all". Everything ships on one branch, `claude/modernize-deps-5x10h6`, as PR #25 with one commit per upgrade. Cloud sessions can only push their own work branch, so separate PRs weren't possible. Each commit can be reverted on its own.

| # | Upgrade | Result |
|---|---|---|
| A | Safe bumps, unused packages removed, nodemon → `node --watch` | Done. |
| B1 | umzug → `db/migrator.js` | Done. Uses the same `SequelizeMeta` table and DDL. Checked both directions against umzug 3.8.3, so going back to v1.8.0 is safe. Server audit is now 0. |
| B2 | Node 24 (Docker + CI) | Done. `engines` is `>=22.12.0`. The multiarch image now compiles sqlite3 with node-gyp directly (npm 11 deprecates `--build-from-source`). |
| B3 | vite-plugin-compression2 | Done. The .gz/.br output is byte-for-byte the same size. |
| C4 | @redux-devtools/extension 4 | Done. |
| C6 | axios → fetch | Done on both sides. The Docker unix socket uses `node:http`. Behavior change: HTTP(S)_PROXY needs `NODE_USE_ENV_PROXY=1`. |
| C1 | Vite 8 / plugin-react 6 / svgr 5 | Done. `codeSplitting` groups with priorities, and dnd-kit is still lazy for guests. Build time 3.4 s → 1.4 s. First load 103.0 → 106.0 KB gz, 4 → 12 files. |
| C2 | @kubernetes/client-node 2 | Done, and it **fixes a bug**: k8s discovery had been broken since client-node 1.x (`res.body.items`). |
| C3 | dotenv 18; docker-secret | dotenv 18 is done. docker-secret 2.x ships babel-jest as a runtime dependency (~900 packages, 11 audit findings), so it is replaced with ~15 lines in `utils/init/initDockerSecrets.js`. |
| C5 | TypeScript 7 | Done. Adds `npm run typecheck`. Errors 123 → 11. The 11 left are real code issues (see CHANGELOG). |

Final checks, on clean installs under both Node 22.22/npm 10.9 and Node 24.21/npm 11.19:
- Server tests: 165/165 on both.
- `npm audit` is 0 on the server and 0 on the client.
- `vite build` succeeds.
- Chromium against a server built from the branch: login (bad and good password), app create with JSON and with an icon upload, custom CSS round trip, dnd-kit lazy for guests.

The only build-log deprecation warnings left are `dottie` (Sequelize) and `prebuild-install` (sqlite3), as planned.
