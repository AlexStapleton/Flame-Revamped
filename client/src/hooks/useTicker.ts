import { useEffect, useRef, useState } from 'react';

// Re-evaluates `compute` every `intervalMs` while the tab is visible, and
// returns the latest value. A hidden tab stops ticking; showing it again
// refreshes at once. The component re-renders only when the value changes
// (setState bails out on an equal primitive), so keep `compute` returning a
// primitive.
export const useTicker = <T extends string | number>(
  compute: () => T,
  intervalMs: number
): T => {
  const [value, setValue] = useState<T>(compute);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let timer: number | null = null;

    const tick = () => setValue(computeRef.current());

    const start = (refresh: boolean) => {
      if (timer !== null) return;
      if (refresh) tick();
      timer = window.setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () =>
      document.visibilityState === 'visible' ? start(true) : stop();

    if (document.visibilityState !== 'hidden') start(false);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs]);

  return value;
};

// Current time in ms, refreshed every `intervalMs` while the tab is visible.
export const useNow = (intervalMs: number): number =>
  useTicker(Date.now, intervalMs);
