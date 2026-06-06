# Configurable Dashboard Width — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)

## Problem

On the dashboard, zooming in with `Ctrl +` makes the app/bookmark icons shift
inward toward the center instead of filling the page width.

The cause is in [`Layout.module.css`](../../../client/src/components/UI/Layout/Layout.module.css).
The page `.Container` reserves a **fixed** horizontal padding at large widths:

```css
@media (min-width: 1201px) {
  .Container {
    padding: 50px 250px;
  }
}
```

Zooming in does not widen the page — it magnifies content, which shrinks the
effective viewport measured in CSS pixels. As long as that effective width stays
≥ 1201px, the rule reserves a constant 250px per side. Because 250px is absolute
(not proportional), it consumes a growing share of the shrinking viewport, so the
content column is squeezed toward the center. The `1fr` grid columns then fill
that already-narrowed container, producing the inward-clustering effect.

## Goal

1. Replace the fixed side padding with a **percentage-based**, viewport-scaling
   width so zoom no longer squeezes the layout.
2. Expose the width as a user setting under **Settings → Interface**.

Non-goals: changing small-screen (mobile/tablet) responsive behavior, or
restructuring the grid breakpoints.

## Design

### 1. CSS — percentage-based container

In `Layout.module.css`, replace the `min-width: 1201px` fixed-padding rule with a
centered, percentage-width container driven by a CSS variable:

```css
@media (min-width: 1201px) {
  .Container {
    width: var(--dashboard-width, 75%);
    max-width: 100%;
    margin: 0 auto;
    padding: 50px 0;
  }
}
```

- The base rule (`width: 100%; padding: 20px`) and the `min-width: 769px` rule
  (`width: 90%`) are unchanged, so phones/tablets keep filling the width.
- `var(--dashboard-width, 75%)` falls back to 75% when the variable is unset
  (e.g., before config loads), matching the chosen default.
- `max-width: 100%` keeps the container from overflowing if a value > 100 ever
  slips through.

### 2. New config value: `dashboardWidth`

A numeric percentage threaded through the existing config pipeline (same path as
the other Interface settings, e.g. `hideHeader`):

| File | Change |
|------|--------|
| `utils/init/initialConfig.json` | add `"dashboardWidth": 75` — this is the server allow-list (`pickKnownKeys`), so the key **must** exist here for `updateConfig` to accept it; `initConfig.js` migrates existing `config.json` files by adding missing keys on startup |
| `client/src/interfaces/Config.ts` | add `dashboardWidth: number;` |
| `client/src/interfaces/Forms.ts` | add `dashboardWidth: number;` to `UISettingsForm` |
| `client/src/utility/templateObjects/settingsTemplate.ts` | add `dashboardWidth: 75` to `uiSettingsTemplate` |

### 3. Interface setting control

In [`UISettings.tsx`](../../../client/src/components/Settings/UISettings/UISettings.tsx),
add a new `SettingsHeadline text="Layout"` section with a **number input**:

```tsx
<InputGroup>
  <label htmlFor="dashboardWidth">Dashboard width (%)</label>
  <input
    type="number"
    id="dashboardWidth"
    name="dashboardWidth"
    min={30}
    max={100}
    value={formData.dashboardWidth}
    onChange={(e) => inputChangeHandler(e, { isNumber: true })}
  />
  <span>
    Percentage of the page width the dashboard fills on large screens.
    Lower values center the content; 100 fills edge to edge.
  </span>
</InputGroup>
```

`inputHandler`'s `isNumber` option already does `parseFloat`. The existing
`formSubmitHandler` persists it via `updateConfig` with no changes.

### 4. Apply the value as a CSS variable

Mirror the existing `setTheme` pattern (which sets `--color-*` on
`document.body.style`). Add a `useEffect` in [`App.tsx`](../../../client/src/App.tsx)
keyed on `config.dashboardWidth` that writes the variable:

```ts
useEffect(() => {
  const raw = Number(config.dashboardWidth);
  // Guard against NaN / empty / out-of-range while the user is typing.
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(30, raw)) : 75;
  document.body.style.setProperty('--dashboard-width', `${pct}%`);
}, [config.dashboardWidth]);
```

The clamp (30–100) keeps a transient empty/invalid input from collapsing the
layout. The CSS fallback covers the pre-load window before this effect runs.

## Data flow

```
UISettings form (number input)
  -> inputHandler(isNumber) -> formData.dashboardWidth
  -> updateConfig (PUT /api/config)
  -> server pickKnownKeys allow-list (key present in initialConfig.json)
  -> config.json + in-memory cache
  -> redux config state
  -> App.tsx useEffect sets --dashboard-width on <body>
  -> Layout.module.css .Container reads var(--dashboard-width)
```

## Testing / verification

- Run the client, log in, set Dashboard width to several values (50, 75, 100),
  save, and confirm the home grid width changes accordingly on a wide viewport.
- Zoom in with `Ctrl +` and confirm icons keep filling the configured width
  instead of clustering toward the center.
- Confirm an existing `config.json` (without the key) gets `dashboardWidth: 75`
  added on server startup via `initConfig`.
- Confirm mobile/tablet widths still fill the screen (rules below 1201px
  unchanged).
```
