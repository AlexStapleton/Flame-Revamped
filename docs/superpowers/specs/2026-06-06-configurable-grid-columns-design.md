# Configurable Grid Columns — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Follows:** `2026-06-06-configurable-dashboard-width-design.md`

## Problem / Goal

The Applications and Bookmarks grids use a fixed responsive ramp of columns
(1 → 2 → 3 → 4) that caps at 4 at ≥900px, hardcoded in
[`AppGrid.module.css`](../../../client/src/components/Apps/AppGrid/AppGrid.module.css)
and
[`BookmarkGrid.module.css`](../../../client/src/components/Bookmarks/BookmarkGrid/BookmarkGrid.module.css).

Make the wide-screen column count user-configurable, with **separate** settings
for the two grids, placed next to the "Dashboard width (%)" control added in the
previous change (Settings → Interface → Layout).

Non-goals: changing the breakpoint widths themselves, or the per-card layout.

## Decisions

- **Two independent settings:** `appsColumns` and `bookmarksColumns`, both
  numbers, default **4** (preserves current behavior).
- **"Max on wide screens":** the setting is the column count at the widest
  breakpoint (≥900px). Narrower widths keep ramping down so phones/tablets stay
  readable.
- **No inversion:** lower breakpoints are *capped* at the setting, so a smaller
  screen never shows more columns than the user asked for.
- **Range:** clamped to **1–12**.

## Design

### 1. New config values

Threaded through the existing config pipeline exactly like `dashboardWidth`:

| File | Change |
|------|--------|
| `utils/init/initialConfig.json` | add `"appsColumns": 4`, `"bookmarksColumns": 4` — server allow-list (`pickKnownKeys`); `initConfig.js` migrates existing `config.json` on startup |
| `client/src/interfaces/Config.ts` | add `appsColumns: number;` and `bookmarksColumns: number;` |
| `client/src/interfaces/Forms.ts` | add both to `UISettingsForm` |
| `client/src/utility/templateObjects/settingsTemplate.ts` | add both (`4`) to `uiSettingsTemplate` |

### 2. Grid CSS reads variables

`AppGrid.module.css` — base stays `repeat(1, 1fr)`; the three media queries read
per-breakpoint variables with fallbacks matching today's values:

```css
.AppGrid { display: grid; grid-template-columns: repeat(1, 1fr); }
@media (min-width: 430px) { .AppGrid { grid-template-columns: repeat(var(--apps-cols-sm, 2), 1fr); } }
@media (min-width: 670px) { .AppGrid { grid-template-columns: repeat(var(--apps-cols-md, 3), 1fr); } }
@media (min-width: 900px) { .AppGrid { grid-template-columns: repeat(var(--apps-cols-lg, 4), 1fr); } }
```

`BookmarkGrid.module.css` — identical, using `--bm-cols-sm/md/lg`.

The fallbacks mean the grids render exactly as today before the config-driven
variables are applied (e.g. first paint, or if JS hasn't run yet).

### 3. JS applies the variables (clamped)

In [`App.tsx`](../../../client/src/App.tsx), add an effect — mirroring the
`--dashboard-width` effect — that sets the six variables from config. A small
local helper avoids repetition:

```ts
useEffect(() => {
  const setCols = (prefix: string, value: number) => {
    const n = Number.isFinite(value) ? Math.min(12, Math.max(1, value)) : 4;
    document.body.style.setProperty(`${prefix}-sm`, `${Math.min(2, n)}`);
    document.body.style.setProperty(`${prefix}-md`, `${Math.min(3, n)}`);
    document.body.style.setProperty(`${prefix}-lg`, `${n}`);
  };
  setCols('--apps-cols', Number(config.appsColumns));
  setCols('--bm-cols', Number(config.bookmarksColumns));
}, [config.appsColumns, config.bookmarksColumns]);
```

Capping `sm`/`md` at the setting prevents a narrower screen from showing more
columns than the configured wide-screen count. The clamp (1–12) guards against a
transient empty/invalid value while typing in Settings.

Examples:
- `n = 6` → ramp `1 → 2 → 3 → 6`
- `n = 2` → ramp `1 → 2 → 2 → 2`
- `n = 4` (default) → ramp `1 → 2 → 3 → 4` (unchanged from today)

### 4. Interface controls

In [`UISettings.tsx`](../../../client/src/components/Settings/UISettings/UISettings.tsx),
add two number inputs to the existing **Layout** section, immediately after
"Dashboard width (%)":

```tsx
<InputGroup>
  <label htmlFor="appsColumns">Applications columns</label>
  <input type="number" id="appsColumns" name="appsColumns" min={1} max={12}
    value={formData.appsColumns}
    onChange={(e) => inputChangeHandler(e, { isNumber: true })} />
  <span>Number of columns for the applications grid on large screens.</span>
</InputGroup>
<InputGroup>
  <label htmlFor="bookmarksColumns">Bookmarks columns</label>
  <input type="number" id="bookmarksColumns" name="bookmarksColumns" min={1} max={12}
    value={formData.bookmarksColumns}
    onChange={(e) => inputChangeHandler(e, { isNumber: true })} />
  <span>Number of columns for the bookmarks grid on large screens.</span>
</InputGroup>
```

`inputHandler`'s `isNumber` option (`parseFloat`) and the existing
`formSubmitHandler`/`updateConfig` need no changes.

## Data flow

```
UISettings number inputs
  -> inputHandler(isNumber) -> formData.{appsColumns,bookmarksColumns}
  -> updateConfig (PUT /api/config) -> server allow-list -> config.json + cache
  -> redux config state
  -> App.tsx effect sets --apps-cols-* / --bm-cols-* on <body> (clamped)
  -> AppGrid / BookmarkGrid CSS read the variables per breakpoint
```

## Testing / verification

- Run the client; on a wide viewport (≥900px), set Applications columns to 6 and
  Bookmarks columns to 3, save, and confirm each grid renders the chosen number
  of columns.
- Shrink the viewport and confirm the ramp still steps down (never exceeding the
  setting) and that mobile remains usable.
- Set a grid to 2 and confirm no inversion (no breakpoint shows 3 columns).
- Confirm an existing `config.json` gets `appsColumns`/`bookmarksColumns` added
  on server startup via `initConfig`.
- Confirm defaults (4/4) reproduce today's layout exactly.
```
