# Flame – Fix Plan (status: current as of 2026-06-02)

Goal: a working custom image (`alexstapo/flame-revamped`),
with the drag-to-reorder ("move items on the dashboard") issue resolved.

Project: `flame@2.4.3`. Node/Express 5 + Sequelize/SQLite backend, React 19 + Vite 7 frontend.
Drag-and-drop has been migrated from the abandoned `react-beautiful-dnd` to `@dnd-kit`
(React 19-compatible). Two Dockerfiles: `.docker/Dockerfile` (single-arch) and
`.docker/Dockerfile.multiarch` (preferred, buildx).

> NOTE: A previous session already implemented most of the original plan but left the
> checkboxes unchecked. Items below reflect the **actual code state**, re-verified file-by-file.

---

## The reported bug: "I drag items on the dashboard and nothing happens"

**Root cause (confirmed):** drag-to-reorder is gated behind `useOrdering === 'orderId'`.
The shipped default was `"createdAt"`, so every drag handler hits
`if (config.useOrdering !== 'orderId') return;` and silently no-ops (with an easy-to-miss
"Custom order is disabled" banner). Reordering only exists in the **table view** of the
Settings → Apps / Bookmarks pages — the homescreen grid is not draggable in stock Flame.

**Fixes applied:**
- [x] Default `useOrdering` flipped to `"orderId"` in `utils/init/initialConfig.json`
      and the client templates (`configTemplate.ts`, `settingsTemplate.ts`) so fresh
      installs get working drag out of the box.
- [x] `PointerSensor` activation constraint (`distance: 8`) added to all three sortable
      tables (`AppTable`, `BookmarksTable`, `CategoryTable`) so clicks on the row action
      buttons (edit/delete/pin) are no longer hijacked into a drag.
- [x] Reorder persistence race fixed — see B1 below.

**User action for an existing install:** Settings → General → Sorting type → "Custom order"
(or it has been pre-set in `data/config.json`).

---

## Backend correctness

- [x] **B1. Reorder controllers were fire-and-forget.** `reorderApps.js`, `reorderBookmarks.js`,
      `reorderCategories.js` used `forEach(async … await update)` and returned `200` before the
      DB writes completed, swallowing errors. Rewritten to `await Promise.all(...map(...))` so the
      response only sends after all `orderId` writes succeed and failures reach the error handler.
      Verified end-to-end (login → reorder → re-fetch shows persisted `orderId`).
- [x] **A1. Auth bypass** (`middleware/auth.js`) — already fixed; `tokenIsValid = true` is inside
      the `try` after `jwt.verify`, with a `catch`.
- [x] **A2. `logger.error()` crash** (`utils/secret.js`) — already fixed; uses `logger.log(…, 'ERROR')`.
- [x] **A3. `errorHandler.js` undefined `message`** — already guarded; dead Sequelize block removed.
- [x] **A4. `initFiles.js` async `forEach`** — already converted to `for…of` + `await`.
- [x] **A5. `createFile.js` parent dir** — already `mkdirSync(dirname, { recursive: true })`.
- [x] **A6. `backupDb.js` mkdir** — already `{ recursive: true }`.

---

## Docker / deploy

- [x] **D1. `.env` baked into image** — `.env` / `.env.*` excluded via `.dockerignore`.
- [x] **D5. `python3-distutils`** — `Dockerfile.multiarch` already uses `python3-setuptools`.
- [x] **D6. Lockfile drift** — client `package-lock.json` regenerated to match `package.json`
      (after removing the orphan `@types/react-beautiful-dnd`); root lockfile updated with
      non-breaking audit fixes.
- [x] **D4. Single `.docker/Dockerfile`** is now a clean 3-stage build (clientbuilder → serverbuilder
      → runtime) — the final image copies only prod `node_modules` + specific source dirs, no client
      sources or dev deps leak in. Either Dockerfile is fine; for one arch:
      `docker buildx build --load --platform linux/amd64 -f .docker/Dockerfile.multiarch -t flame:custom .`
      (Docker daemon was not running in this environment, so no live image build was performed.)

---

## Hygiene

- [x] **Q-deps. Orphan `@types/react-beautiful-dnd`** removed from `client/package.json`.
- [x] **Q-test. Broken `react-scripts test` script** removed from `client/package.json`.
- [x] **Q1. npm audit.** Client now **0 vulnerabilities** (axios patched within `^1.x`).
      Root reduced 23 → 13. The remaining 13 only "fix" via `npm audit fix --force`, which would
      install `sequelize@3.30.0` / downgrade `sqlite3` — **breaking, do not apply.** They are
      transitive DB-layer advisories; resolve via upstream major bumps, not a forced downgrade.
- [ ] **Q2. `client/tsconfig.json` `target: es5`** + leftover CRA `eslintConfig` block — cosmetic.

---

## Not done (decisions / features)

- [ ] **Homescreen drag-and-drop.** Stock Flame only reorders in the Settings table view. Dragging
      the cards on the homescreen itself is a net-new feature (which cards, pinned-only, persistence).
- [ ] **Forced major dependency bumps** for the remaining root vulns (breaks the app today).

---

## Verification done

| Check | Result |
|-------|--------|
| `cd client && npm run build` | ✅ 295 modules, exit 0 |
| `node server.js` boot | ✅ migrations clean, listening on 5005 |
| Reorder API: login → PUT `/api/apps/0/reorder` → GET `/api/apps` | ✅ `orderId` persisted |
| Backend controller syntax checks | ✅ all pass |
