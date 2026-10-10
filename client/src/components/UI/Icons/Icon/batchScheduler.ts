// Pure scheduling for batched requests. Calls to schedule() are coalesced into
// one flush. The flush runs debounceMs after the most recent call, but never
// later than maxWaitMs after the first call of the batch, so a continuous
// stream of calls cannot postpone it indefinitely.

export interface BatchTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

export interface BatchWindow {
  debounceMs: number;
  maxWaitMs: number;
}

const browserTimers: BatchTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export const createBatchScheduler = (
  flush: () => void,
  timing: BatchWindow,
  timers: BatchTimers = browserTimers
): { schedule: () => void } => {
  let timer: unknown = null;
  let batchStart = 0;

  return {
    schedule(): void {
      const now = timers.now();
      if (timer === null) {
        batchStart = now;
      } else {
        timers.clearTimeout(timer);
      }
      const untilCap = batchStart + timing.maxWaitMs - now;
      const delay = Math.max(0, Math.min(timing.debounceMs, untilCap));
      timer = timers.setTimeout(() => {
        timer = null;
        flush();
      }, delay);
    },
  };
};
