// Builds the periodic status-check tick used by jobs.js.
//
// Two guards live here:
//   - idle pause: skip the run unless the dashboard was viewed recently
//     (`isActive(idleWindowMs)`), so an unattended instance stops probing.
//   - in-flight guard: if the previous run is still going (slow/unreachable
//     hosts can make a run outlast the interval), skip this tick instead of
//     starting an overlapping run. Runs never pile up.
//
// Pure factory (all I/O is injected) so it is unit-testable.
const createStatusTick = ({ isActive, run, idleWindowMs, onError = () => {} }) => {
  let inFlight = false;

  return async function statusTick() {
    if (inFlight) return;
    if (!isActive(idleWindowMs)) return;

    inFlight = true;
    try {
      await run();
    } catch (err) {
      onError(err);
    } finally {
      inFlight = false;
    }
  };
};

module.exports = { createStatusTick };
