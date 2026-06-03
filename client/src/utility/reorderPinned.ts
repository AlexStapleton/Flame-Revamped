/**
 * Map a reordered subset of pinned items back onto the full list.
 *
 * The homescreen only shows pinned items, but `orderId` is global across the
 * whole list. To reorder pinned items without colliding with non-pinned ones,
 * we walk the full list (in its current order) and, wherever a pinned item
 * sits, drop in the next item from the reordered pinned queue. Non-pinned items
 * keep their original slots. The caller then assigns fresh `orderId`s across the
 * returned full list.
 *
 * `reorderedPinned` must contain exactly the pinned members of `full`.
 */
export const rebuildOrderFromPinned = <T extends { isPinned: boolean }>(
  full: T[],
  reorderedPinned: T[]
): T[] => {
  const queue = [...reorderedPinned];
  return full.map((item) => (item.isPinned ? queue.shift() ?? item : item));
};
