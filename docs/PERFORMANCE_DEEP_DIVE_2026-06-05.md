# Flame — Performance Deep Dive (2026-06-05)

Third performance pass over the **current** codebase. The earlier two reviews
([ARCHITECTURE_PERFORMANCE_REVIEW.md](ARCHITECTURE_PERFORMANCE_REVIEW.md),
[SECURITY_PERFORMANCE_AUDIT_2026-06-04.md](SECURITY_PERFORMANCE_AUDIT_2026-06-04.md))
closed the structural wins; this pass only lists **new findings** plus a status
re-check of the prior open items.

Most new findings cluster around two themes that appeared *after* the last audit
(the app health-check feature and the client mutation flow): **redundant network
round-trips** and **continuous DB write amplification**.

> **Status (2026-06-05): N1–N6 all IMPLEMENTED and merged** (PRs #7–#11).
> - **N1** (#7) — sort thunks read `useOrdering` from the store instead of refetching `/api/config`.
> - **N2** (#8) — status checks write only when the status changed; pure `needsUpdate` unit-tested.
> - **N5/N6** (#9) — search regex compiled once per query; Home cards narrow their `useSelector` and are `React.memo`-wrapped.
> - **N3** (#10) — the 60s apps poll pauses while the tab is hidden and refreshes on refocus.
> - **N4** (#11) — build precompresses to `.br`/`.gz`; `express-static-gzip` serves them (brotli preferred), verified at runtime.
>
> The SVG-loader item below is **correctness, not perf** — left for a separate change.

---

## Status of prior open items (re-verified in code)

| ID | Item | Status |
|----|------|--------|
| PERF-1 | SQLite WAL + busy_timeout + synchronous=NORMAL | ✅ Done (`db/index.js:46-48`) |
| PERF-2 | `@mdi/js` dynamic import (off critical path) | ✅ Done (`client/src/components/UI/Icons/Icon/Icon.tsx`) |
| PERF-3 | `getAllCategories` name-order can't use an index | 🟡 Still deferred (negligible at scale) |
| PERF-4 | Weather job runs with zero clients connected | 🟡 Still deferred — **see N2, same shape, now also for status checks** |
| SEC-1 | Upload size/count limit | ✅ Done (`middleware/multer.js:39`) |
| A1–A3, B1–B4, C1–C6 | First-pass backlog | ✅ Done |

---

## 🟠 NEW — MEDIUM

### N1 — Every app/bookmark/category mutation fires a redundant `GET /api/config`
**Files:** [`client/src/store/action-creators/app.ts`](../client/src/store/action-creators/app.ts) (`sortApps`, lines 225-236),
[`client/src/store/action-creators/bookmark.ts`](../client/src/store/action-creators/bookmark.ts) (`sortCategories` 284-296, `sortBookmarks` 390-405)

`addApp`/`updateApp` (and the bookmark/category equivalents) finish by dispatching
`sortApps()` / `sortCategories()` / `sortBookmarks()`. Each of those thunks does:

```ts
const res = await axios.get<ApiResponse<Config>>('/api/config');
dispatch({ type: ActionType.sortApps, payload: res.data.data.useOrdering });
```

The **only** value pulled from that response is `useOrdering` — which is already
in the Redux store (`state.config.config.useOrdering`, kept fresh by `getConfig`
on boot and every `updateConfig`). So every single add / edit / reorder-settle
costs an extra HTTP round-trip to the server (which itself calls `loadConfig`)
purely to re-read a value the client already holds.

**Action:** read `useOrdering` from the store instead of refetching. Redux-thunk
thunks receive `getState` as the second arg:

```ts
export const sortApps = () => (dispatch, getState) => {
  const { useOrdering } = getState().config.config;
  dispatch({ type: ActionType.sortApps, payload: useOrdering });
};
```

Removes one request per mutation across all three entity types; no behavior change.

**Effort:** S · **Impact:** Medium (kills a request on every edit; the Settings
tables can fire these in quick succession).

### N2 — Status checks write a row per app every interval, unconditionally, regardless of viewers
**Files:** [`utils/runStatusChecks.js`](../utils/runStatusChecks.js),
[`utils/jobs.js`](../utils/jobs.js) (lines 60-71),
[`utils/checkAppStatus.js`](../utils/checkAppStatus.js)

`runStatusChecks` runs every `statusCheckInterval` (default **60s**) and, for every
status-check-enabled app, does:

```js
await app.update({ status, statusCheckedAt: new Date() });
```

Three problems compound:

1. **Unconditional write.** The row is written every tick **even when `status`
   didn't change**. For *N* monitored apps that's *N* UPDATEs/minute, forever — a
   steady stream of writes (and WAL frame churn) on an app whose entire premise is
   that it's mostly idle. This is the same write-amplification pattern A1 removed
   from `GET /api/apps`, reintroduced by the health-check feature.
2. **Runs with zero clients.** Like PERF-4 (weather), the probes + writes happen
   even when no browser is open. The status dots are only visible to an
   authenticated admin viewing the page.
3. **Unbounded probe fan-out.** `Promise.all(apps.map(checkOne))` fires every probe
   at once, and each probe can take up to **HEAD 5s + GET 5s = 10s** on a hanging
   host (`checkAppStatus.js` retries GET after a HEAD failure, both `timeout: 5000`).
   Fine for a handful of apps; a foot-gun if someone monitors many.

**Action (pick per appetite):**
- Cheapest, highest value: **only write when the status changed.** Compare against
  `app.status` and skip the UPDATE otherwise (optionally still bump
  `statusCheckedAt` on a coarser cadence). Turns *N* writes/min into ~0 in steady
  state.
- Gate the whole tick on there being ≥1 active WebSocket client (mirrors the
  PERF-4 recommendation), so an unattended instance does no probing.
- Cap concurrency (e.g. a small pool) if large app counts are expected.

**Effort:** S (the conditional-write change) · **Impact:** Medium (removes
continuous background write load; lower idle CPU/network).

---

## 🟡 NEW — LOW

### N3 — Authenticated homescreen polls the full `GET /api/apps` every 60s just for status dots
**File:** [`client/src/components/Home/Home.tsx`](../client/src/components/Home/Home.tsx) (lines 56-61)

```ts
const id = window.setInterval(() => getApps(), 60000);
```

While logged in, the homepage refetches the **entire** apps collection once a
minute so the health dots stay current. The only thing that actually changes
between fetches is the `status` field. Paired with N2's server-side 60s cadence,
an open admin tab does a full list re-fetch + full re-render every minute.

**Action:** push status changes over the **existing weather WebSocket** (or a
second channel) instead of polling, or at least widen the interval. Low priority —
the payload is small — but it's pure polling for data that already has a push path
available.

### N4 — `compression()` re-gzips immutable hashed assets on every cold request
**File:** [`api.js`](../api.js) (line 31)

`/assets/*` are content-hashed and served `immutable, max-age=1y`, yet
`compression()` recompresses the same bytes on the fly for every new client. The
CPU is wasted re-deriving an output that can never change.

**Action:** precompress at build time (`vite-plugin-compression` → `.br`/`.gz`)
and serve the static files with `express-static-gzip` (or equivalent) so gzip/brotli
of the bundle is computed once, not per request. Keep `compression()` for the
dynamic JSON API. Minor at self-host scale; meaningful on a busy/low-power host
(Raspberry Pi).

### N5 — Search compiles a fresh `RegExp` per item, per keystroke, with no debounce
**File:** [`client/src/components/Home/Home.tsx`](../client/src/components/Home/Home.tsx) (lines 70-97)

```ts
apps.filter(({ name, description }) =>
  new RegExp(escapeRegex(localSearch), 'i').test(`${name} ${description}`)
)
```

`new RegExp(...)` is inside the `.filter` callback, so it's recompiled for **every
app and every bookmark on every keystroke**. The pattern is identical across the
loop.

**Action:** hoist the compiled regex above the loop (`const re = new
RegExp(escapeRegex(localSearch), 'i')`) and reuse it; optionally debounce
`localSearch`. Negligible for a few dozen items, cheap to fix.

### N6 — Home cards subscribe to the whole `config` slice and aren't memoized
**Files:** [`client/src/components/Apps/AppCard/AppCard.tsx`](../client/src/components/Apps/AppCard/AppCard.tsx) (line 21),
`client/src/components/Bookmarks/BookmarkCard/BookmarkCard.tsx`

Each `AppCard` does `useSelector((state) => state.config)` and only reads
`config.appsSameTab`. Because it selects the whole config object, any config change
re-renders every card; and since cards aren't `React.memo`-wrapped, the 60s
`getApps()` refetch (N3) — which replaces the `apps` array reference — re-renders
the entire grid even when nothing visible changed.

**Action:** select only the field used (`useSelector((s) => s.config.config.appsSameTab)`)
and wrap the card in `React.memo`. Small render-cost win; matters most on large
dashboards that also poll.

---

## Not a concern (checked, no action)
- **Config cache** (`utils/loadConfig.js`) — in-memory, copy-on-read, `fs.watch`
  invalidation. Solid.
- **WebSocket broadcast** (`Socket.js`) — `readyState` guard, per-send try/catch,
  30s ping/pong reaper. Solid.
- **Weather** (`getExternalWeather.js`) — single row updated in place. Solid.
- **Upload limits / filter** (`middleware/multer.js`) — 5 MB / 1 file, MIME+ext
  check. Solid.

---

## Out of scope but worth flagging (correctness, not perf)
- **SVG-by-URL / uploaded-SVG icons may not render.** `AppCard.tsx:56` and
  `BookmarkCard.tsx:95` emit `<svg data-src={source}>`, the hydration pattern used
  by the `external-svg-loader` package — but that package is **not imported
  anywhere** and **not in `client/package.json`** (only `vite-plugin-svgr` is).
  Without the loader the `data-src` attribute is inert, so SVG icons referenced by
  URL or uploaded as `.svg` likely show as blank. Verify against a live SVG icon;
  if confirmed, either re-add the loader or convert these to plain `<img src>`.

---

## Suggested order
1. **N1** (drop redundant `/api/config` fetches) — trivial, removes a request per edit.
2. **N2** (conditional status write) — small change, kills continuous idle writes.
3. **N5 / N6 / N3** — cheap client render/poll cleanups, bundle together.
4. **N4** — precompressed assets; do when touching the build/Docker pipeline.
5. Investigate the **SVG loader** correctness flag separately (not perf).
