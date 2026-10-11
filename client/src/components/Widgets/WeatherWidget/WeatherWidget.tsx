import { useState, useEffect, Fragment } from 'react';
import { http } from '../../../utility/http';

// Redux
import { useSelector } from 'react-redux';

// Typescript
import { Weather, ApiResponse } from '../../../interfaces';

// CSS
import classes from './WeatherWidget.module.css';

// UI
import { WeatherIcon } from '../../UI';
import { State } from '../../../store/reducers';
import { weatherTemplate } from '../../../utility/templateObjects/weatherTemplate';
import {
  Units,
  activeAlerts,
  alertTime,
  aqiLabel,
  dayLabel,
  gust,
  pressure,
  stat,
  temp,
  tempWithUnit,
  visibility,
  wind,
} from './format';

export const WeatherWidget = (): JSX.Element => {
  const { loading: configLoading, config } = useSelector(
    (state: State) => state.config
  );

  const [weather, setWeather] = useState<Weather>(weatherTemplate);
  const [isLoading, setIsLoading] = useState(true);

  const [alertsOpen, setAlertsOpen] = useState(false);

  // Load the stored weather. Also called after a socket reconnect, because an
  // update pushed while the socket was down would otherwise be missed until
  // the next 15-minute push. Reads the server's database, not WeatherAPI, so
  // it spends no API call.
  const loadWeather = () =>
    http
      .get<ApiResponse<Weather[]>>('/api/weather')
      .then((data) => {
        const weatherData = data.data.data[0];
        if (weatherData) {
          setWeather(weatherData);
        }
        setIsLoading(false);
      })
      .catch((err) => console.log(err));

  // Initial request to get data
  useEffect(() => {
    loadWeather();
  }, []);

  // Socket for data updates. Reconnects with exponential backoff (1s, 2s, 4s...
  // capped at 60s) after the server restarts or a proxy drops the idle socket.
  // Does not reconnect while the tab is hidden; resumes on visibilitychange.
  useEffect(() => {
    const socketProtocol =
      document.location.protocol === 'http:' ? 'ws:' : 'wss:';
    const socketAddress = `${socketProtocol}//${window.location.host}/socket`;

    const BASE_DELAY_MS = 1000;
    const MAX_DELAY_MS = 60000;

    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempts = 0;
    let unmounted = false;
    let hasConnected = false;

    const clearRetry = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (unmounted || retryTimer !== null) return;
      if (document.visibilityState === 'hidden') return;
      const delay = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
      attempts++;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        // Tab went hidden while waiting: leave it to visibilitychange.
        if (document.visibilityState === 'hidden') return;
        connect();
      }, delay);
    };

    const connect = () => {
      if (unmounted || socket) return;
      const client = new WebSocket(socketAddress);
      socket = client;

      client.onopen = () => {
        attempts = 0;
        // Reconnected: catch up on anything pushed while disconnected.
        if (hasConnected) loadWeather();
        hasConnected = true;
      };

      client.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setWeather((prev) => ({
          ...prev,
          ...data,
        }));
      };

      client.onclose = () => {
        if (socket === client) socket = null;
        scheduleReconnect();
      };
    };

    const onVisibilityChange = () => {
      if (unmounted || document.visibilityState !== 'visible') return;
      if (socket) return;
      // Visible again: reconnect now rather than waiting out the backoff.
      clearRetry();
      connect();
    };

    connect();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unmounted = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearRetry();
      if (socket) {
        const client = socket;
        socket = null;
        client.onclose = null;
        client.close();
      }
    };
  }, []);

  const units: Units = {
    isCelsius: config.isCelsius,
    isKilometer: config.isKilometer !== false,
  };
  const forecast = weather.forecast || [];
  const today = forecast[0];
  const extra = stat(config.weatherData, weather, today, units);
  const alerts = config.weatherAlerts !== false ? activeAlerts(weather.alerts) : [];

  const feels =
    weather.feelsLikeC !== null &&
    weather.feelsLikeC !== undefined &&
    temp(weather.feelsLikeC, weather.feelsLikeF, units) !==
      temp(weather.tempC, weather.tempF, units)
      ? temp(weather.feelsLikeC, weather.feelsLikeF, units)
      : null;

  // Hover / keyboard-focus details. Rows with no data are left out.
  const details: [string, string | null][] = [
    ['Feels like', weather.feelsLikeC !== null ? temp(weather.feelsLikeC, weather.feelsLikeF, units) : null],
    ['Humidity', weather.humidity !== null ? `${weather.humidity}%` : null],
    ['Cloud', weather.cloud !== null ? `${weather.cloud}%` : null],
    ['Chance of rain', today?.rainChance !== null && today?.rainChance !== undefined ? `${today.rainChance}%` : null],
    ['Wind', wind(weather, units)],
    ['Gusts', gust(weather, units)],
    ['UV index', weather.uv !== null && weather.uv !== undefined ? `${weather.uv}` : null],
    ['Air quality', aqiLabel(weather.aqi)],
    ['Pressure', pressure(weather, units)],
    ['Visibility', visibility(weather, units)],
    ['Sunrise', today?.sunrise || null],
    ['Sunset', today?.sunset || null],
  ];

  return (
    <div className={classes.WeatherWidget}>
      {configLoading ||
        (config.WEATHER_API_KEY && weather.id > 0 && (
          <Fragment>
            <div className={classes.Main}>
              {/* CURRENT */}
              <div
                className={classes.Current}
                tabIndex={0}
                aria-label={`${weather.conditionText}, ${tempWithUnit(weather, units)}`}
              >
                <div className={classes.WeatherIcon}>
                  <WeatherIcon
                    weatherStatusCode={weather.conditionCode}
                    isDay={weather.isDay}
                  />
                </div>
                <div className={classes.WeatherDetails}>
                  <span>
                    {tempWithUnit(weather, units)}
                    {feels && <small className={classes.Feels}> feels {feels}</small>}
                  </span>
                  <span>
                    {today && (
                      <span title="Today's high and low">
                        ↑{temp(today.maxC, today.maxF, units)} ↓
                        {temp(today.minC, today.minF, units)}
                      </span>
                    )}
                    {today && extra && ' · '}
                    {extra && <span title={extra[1]}>{extra[0]}</span>}
                  </span>
                </div>

                <div className={classes.Popover} role="tooltip">
                  <div className={classes.PopoverTitle}>
                    {weather.conditionText}
                    {weather.locationName && ` · ${weather.locationName}`}
                  </div>
                  <dl>
                    {details
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <Fragment key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </Fragment>
                      ))}
                  </dl>
                  {weather.externalLastUpdate && (
                    <div className={classes.Updated}>
                      Updated {weather.externalLastUpdate.split(' ')[1] || weather.externalLastUpdate}
                    </div>
                  )}
                </div>
              </div>

              {/* 3-DAY FORECAST */}
              {config.weatherForecast !== false && forecast.length > 0 && (
                <div className={classes.Forecast}>
                  {forecast.map((day, i) => (
                    <div
                      key={day.date || i}
                      className={classes.Day}
                      title={day.conditionText || undefined}
                    >
                      <span className={classes.DayName}>{dayLabel(day.date, i)}</span>
                      <WeatherIcon
                        weatherStatusCode={day.conditionCode ?? 1000}
                        isDay={1}
                        size={24}
                        animate={false}
                      />
                      <span>
                        {temp(day.maxC, day.maxF, units)}/{temp(day.minC, day.minF, units)}
                      </span>
                      {!!day.rainChance && (
                        <span className={classes.Rain} title="Chance of rain">
                          {day.rainChance}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ALERTS */}
            {alerts.length > 0 && (
              <div className={classes.Alerts}>
                <button
                  type="button"
                  className={classes.AlertButton}
                  aria-expanded={alertsOpen}
                  onClick={() => setAlertsOpen((open) => !open)}
                >
                  ⚠ {alerts[0].event || alerts[0].headline}
                  {alertTime(alerts[0].expires) && ` until ${alertTime(alerts[0].expires)}`}
                  {alerts.length > 1 && ` (+${alerts.length - 1} more)`}
                </button>
                {alertsOpen && (
                  <div className={classes.AlertDetails}>
                    {alerts.map((a, i) => (
                      <div key={i} className={classes.Alert}>
                        <strong>{a.headline || a.event}</strong>
                        {a.severity && <span> · {a.severity}</span>}
                        {a.areas && <div className={classes.AlertAreas}>{a.areas}</div>}
                        {a.desc && <div className={classes.AlertText}>{a.desc}</div>}
                        {a.instruction && <div className={classes.AlertText}>{a.instruction}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Fragment>
        ))}
    </div>
  );
};
