// Tracks the last time a client read the app list. Background status probing
// uses this to pause on an unattended instance (no dashboards open) instead of
// hitting every monitored host forever. Page loads and the homescreen's periodic
// refresh both call GET /api/apps, which marks activity.
//
// In-memory + process-local by design: the scheduled job and the HTTP handlers
// run in the same process, and the signal is purely an optimisation (losing it
// on restart just means probing stays paused until the next view).

let lastActiveAt = 0;

const markActive = () => {
  lastActiveAt = Date.now();
};

const msSinceActive = () => Date.now() - lastActiveAt;

// True if the dashboard was viewed within the last `windowMs`. Returns false
// until the first view (lastActiveAt === 0), so a freshly started, unviewed
// instance does no probing.
const isActive = (windowMs) => lastActiveAt !== 0 && msSinceActive() <= windowMs;

module.exports = { markActive, msSinceActive, isActive };
