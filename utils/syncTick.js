// Builds the scheduled app-sync tick. The tick:
//  - skips when no dashboard has been viewed within the idle window (same
//    gating as status checks), and
//  - skips when a previous sync is still running, so runs never overlap.
// The startup sync and the authenticated POST /api/apps/sync do not use this and
// always run.
const createSyncTick = ({ isActive, syncApps, idleWindowMs, onError }) => {
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return 'in-flight';
    if (!isActive(idleWindowMs)) return 'idle';

    inFlight = true;
    try {
      await syncApps();
      return 'ran';
    } catch (err) {
      if (onError) onError(err);
      return 'error';
    } finally {
      inFlight = false;
    }
  };

  return tick;
};

module.exports = createSyncTick;
