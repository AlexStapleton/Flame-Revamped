# Homescreen drag-and-drop — design (2026-06-02)

## Goal
Let an authenticated user reorder the **pinned app cards** and **pinned bookmark
category cards** directly on the homescreen by dragging, persisting the new order via
the existing reorder endpoints. The table-view reorder (Settings → Apps/Bookmarks) is
already fixed; this is additive.

## Scope
- In: drag-reorder of pinned **app** cards and pinned **category** cards on the homescreen.
- Out: reordering individual bookmarks *within* a category card on the homescreen (nested
  drag; still available in the Bookmarks table view). No backend changes.

## Constraints discovered
- `AppGrid` and `BookmarkGrid` are shared between the homescreen and the `/applications`
  and `/bookmarks` grid views → homescreen drag must be **opt-in**, not unconditional.
- The homescreen renders only the *pinned* subset, but `orderId` is global across all
  items → naive subset reordering causes `orderId` collisions. Must rebuild the full list.
- The homescreen is publicly viewable; reorder endpoints require auth.

## Approach
Add an opt-in `sortable?: boolean` prop to `AppGrid` and `BookmarkGrid`.

- When `sortable` is true, the grid wraps its cards in `DndContext` + `SortableContext`
  and renders each card inside a reusable `SortableItem` wrapper (`div` + `useSortable`).
- `Home.tsx` passes `sortable={isAuthenticated && config.useOrdering === 'orderId' && !searching}`.
- `/applications` and `/bookmarks` grids omit `sortable` → behavior unchanged.

### New component: `SortableItem`
`client/src/components/UI/SortableItem/SortableItem.tsx`
- Props: `id: number`, `children`.
- Renders a `div` with `ref={setNodeRef}`, `style` (CSS transform/transition, drag opacity),
  and spreads `{...attributes} {...listeners}`.
- Exported from the UI barrel (`components/UI/index.ts`).

### Click vs. drag
Cards are `<a>` links. Sensors use `PointerSensor` with
`activationConstraint: { distance: 8 }` (a click opens the link; only a >8px move starts a
drag) plus `KeyboardSensor` with `sortableKeyboardCoordinates`, matching the tables.

### Persistence (full-list rebuild)
On `onDragEnd` with a valid move:
1. `arrayMove` the **pinned subset** (the array the grid was given) to the new order.
2. Rebuild the **full** list from the redux store: iterate the full list in current order;
   wherever a pinned item sits, replace it with the next item from the reordered pinned
   queue; non-pinned items keep their slots.
3. Dispatch `reorderApps(fullList)` / `reorderCategories(fullList)` — these assign
   `orderId = index + 1` across the whole list (no collisions) and PUT to the
   already-fixed `/api/{apps,categories}/0/reorder` endpoints.

### Data access
`AppGrid` and `BookmarkGrid` gain `useSelector` (full `apps` / `categories`) and
`useDispatch` (`reorderApps` / `reorderCategories`) only in the sortable path.

## Guards
Drag enabled only when: authenticated AND `config.useOrdering === 'orderId'` AND not
searching. Otherwise the grids render exactly as today.

## Testing
- `cd client && npm run build` must pass (TS + Vite).
- Unit-style check of the full-list-rebuild helper (pure function) for the
  pinned-subset → full-list mapping, including non-contiguous pinned positions.
- Reorder API path already verified end-to-end (login → PUT reorder → GET shows persisted
  `orderId`).

## Risks
- Dragging an `<a>` card: mitigated by the distance activation constraint (proven on tables).
- `orderId` collisions: avoided by the full-list rebuild.
