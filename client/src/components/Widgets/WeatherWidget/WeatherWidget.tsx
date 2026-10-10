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

export const WeatherWidget = (): JSX.Element => {
  const { loading: configLoading, config } = useSelector(
    (state: State) => state.config
  );

  const [weather, setWeather] = useState<Weather>(weatherTemplate);
  const [isLoading, setIsLoading] = useState(true);

  // Initial request to get data
  useEffect(() => {
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

  return (
    <div className={classes.WeatherWidget}>
      {configLoading ||
        (config.WEATHER_API_KEY && weather.id > 0 && (
          <Fragment>
            <div className={classes.WeatherIcon}>
              <WeatherIcon
                weatherStatusCode={weather.conditionCode}
                isDay={weather.isDay}
              />
            </div>
            <div className={classes.WeatherDetails}>
              {/* TEMPERATURE */}
              {config.isCelsius ? (
                <span>{weather.tempC}°C</span>
              ) : (
                <span>{Math.round(weather.tempF)}°F</span>
              )}

              {/* ADDITIONAL DATA */}
              <span>{weather[config.weatherData]}%</span>
            </div>
          </Fragment>
        ))}
    </div>
  );
};
