// Builds the scheduled weather tick. The tick:
//  - skips when no dashboard has been viewed within the idle window (same
//    gating as app sync and status checks), so an unattended instance does not
//    call WeatherAPI or rewrite the weather row, and
//  - skips when no weather key is configured.
// A dashboard opened after an idle period gets fresh weather from the
// GET /api/weather refresh-if-stale path instead.
const createWeatherTick = ({ isActive, idleWindowMs, loadConfig, refresh, onError }) => {
  const tick = async () => {
    if (!isActive(idleWindowMs)) return 'idle';
    try {
      const { WEATHER_API_KEY } = await loadConfig();
      if (!WEATHER_API_KEY) return 'no-key';
      await refresh();
      return 'ran';
    } catch (err) {
      if (onError) onError(err);
      return 'error';
    }
  };
  return tick;
};

module.exports = createWeatherTick;
