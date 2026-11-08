// Returns `next` with every item that is deep-equal to the item with the same
// id in `prev` replaced by the previous object, and `prev` itself when nothing
// changed. Polling the lists then hands memoized cards the same references
// instead of fresh copies of identical data.
export const reuseData = <T extends { id: number }>(
  prev: T[],
  next: T[]
): T[] => {
  if (prev.length === 0) return next;

  const before = new Map(prev.map((item) => [item.id, item]));
  let same = prev.length === next.length;

  const merged = next.map((item, i) => {
    const old = before.get(item.id);
    const equal =
      old !== undefined && JSON.stringify(old) === JSON.stringify(item);
    if (!equal || prev[i] !== old) same = false;
    return (equal ? old : item) as T;
  });

  return same ? prev : merged;
};
