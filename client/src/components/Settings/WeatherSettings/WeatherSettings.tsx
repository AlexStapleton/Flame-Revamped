import { useState, ChangeEvent, useEffect, FormEvent } from 'react';
import { http } from '../../../utility/http';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import { ApiResponse, Weather, WeatherForm } from '../../../interfaces';

// UI
import { InputGroup, Button, SettingsHeadline } from '../../UI';

// Utils
import {
  applyAuth,
  inputHandler,
  weatherSettingsTemplate,
} from '../../../utility';

export const WeatherSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification, updateConfig } = bindActionCreators(
    actionCreators,
    dispatch
  );

  // Initial state
  const [formData, setFormData] = useState<WeatherForm>(
    weatherSettingsTemplate
  );

  // Get config. Also follows later config loads, such as the re-fetch after
  // login that replaces the masked key with the real one.
  useEffect(() => {
    setFormData({
      ...config,
    });
  }, [loading, config]);

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    // Check for api key input
    if ((formData.lat || formData.long) && !formData.WEATHER_API_KEY) {
      createNotification({
        title: 'Warning',
        message: 'API key is missing. Weather Module will NOT work',
      });
    }

    // Only a new key or location needs fresh data from WeatherAPI. Units and
    // display options are applied in the browser, so saving them spends no
    // API call (the free plan allows 100,000 a month).
    const needsFetch =
      !!formData.WEATHER_API_KEY &&
      (formData.WEATHER_API_KEY !== config.WEATHER_API_KEY ||
        formData.lat !== config.lat ||
        formData.long !== config.long);

    // Save settings
    await updateConfig(formData);

    if (!needsFetch) return;

    // Fetch weather now; the server pushes it to every open dashboard
    http
      .get<ApiResponse<Weather>>('/api/weather/update', {
        headers: applyAuth(),
      })
      .then(() => {
        createNotification({
          title: 'Success',
          message: 'Weather updated',
        });
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response?.data?.error || 'Weather update failed',
        });
      });
  };

  // Input handler
  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<WeatherForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  // Get user location
  const getLocation = () => {
    window.navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setFormData({
          ...formData,
          lat: latitude,
          long: longitude,
        });
      }
    );
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      <SettingsHeadline text="API" />
      {/* API KEY */}
      <InputGroup>
        <label htmlFor="WEATHER_API_KEY">API key</label>
        <input
          type="text"
          id="WEATHER_API_KEY"
          name="WEATHER_API_KEY"
          placeholder="secret"
          value={formData.WEATHER_API_KEY}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>
          Using
          <a href="https://www.weatherapi.com/pricing.aspx" target="blank">
            {' '}
            Weather API
          </a>
          . Key is required for weather module to work.
        </span>
      </InputGroup>

      <SettingsHeadline text="Location" />
      {/* LAT */}
      <InputGroup>
        <label htmlFor="lat">Latitude</label>
        <input
          type="number"
          id="lat"
          name="lat"
          placeholder="52.22"
          value={formData.lat}
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          step="any"
          lang="en-150"
        />
        <span onClick={getLocation}>
          <a href="#">Click to get current location</a>
        </span>
      </InputGroup>

      {/* LONG */}
      <InputGroup>
        <label htmlFor="long">Longitude</label>
        <input
          type="number"
          id="long"
          name="long"
          placeholder="21.01"
          value={formData.long}
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          step="any"
          lang="en-150"
        />
      </InputGroup>

      <SettingsHeadline text="Other" />
      {/* TEMPERATURE */}
      <InputGroup>
        <label htmlFor="isCelsius">Temperature unit</label>
        <select
          id="isCelsius"
          name="isCelsius"
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
          value={formData.isCelsius ? 1 : 0}
        >
          <option value={1}>Celsius</option>
          <option value={0}>Fahrenheit</option>
        </select>
      </InputGroup>

      {/* UNITS */}
      <InputGroup>
        <label htmlFor="isKilometer">Units for wind, rain and visibility</label>
        <select
          id="isKilometer"
          name="isKilometer"
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
          value={formData.isKilometer ? 1 : 0}
        >
          <option value={1}>Metric (km/h, mm, hPa, km)</option>
          <option value={0}>Imperial (mph, in, inHg, mi)</option>
        </select>
      </InputGroup>

      {/* WEATHER DATA */}
      <InputGroup>
        <label htmlFor="weatherData">Additional weather data</label>
        <select
          id="weatherData"
          name="weatherData"
          value={formData.weatherData}
          onChange={(e) => inputChangeHandler(e)}
        >
          <option value="cloud">Cloud coverage</option>
          <option value="humidity">Humidity</option>
          <option value="rain">Chance of rain today</option>
          <option value="precip">Rain in the last hour</option>
          <option value="wind">Wind</option>
          <option value="uv">UV index</option>
          <option value="aqi">Air quality</option>
          <option value="pressure">Pressure</option>
          <option value="visibility">Visibility</option>
        </select>
        <span>Shown next to today's high and low.</span>
      </InputGroup>

      {/* FORECAST */}
      <InputGroup>
        <label htmlFor="weatherForecast">Show 3-day forecast</label>
        <select
          id="weatherForecast"
          name="weatherForecast"
          value={formData.weatherForecast ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>True</option>
          <option value={0}>False</option>
        </select>
        <span>3 days is the most the free WeatherAPI plan provides.</span>
      </InputGroup>

      {/* ALERTS */}
      <InputGroup>
        <label htmlFor="weatherAlerts">Show severe weather alerts</label>
        <select
          id="weatherAlerts"
          name="weatherAlerts"
          value={formData.weatherAlerts ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>True</option>
          <option value={0}>False</option>
        </select>
        <span>
          Alerts come from local weather services. Coverage depends on your
          country and on your WeatherAPI plan.
        </span>
      </InputGroup>

      <Button>Save changes</Button>
    </form>
  );
};
