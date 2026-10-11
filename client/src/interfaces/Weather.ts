import { Model } from '.';

// One day of the 3-day forecast (the free WeatherAPI plan's maximum).
export interface WeatherForecastDay {
  date: string | null;
  maxC: number | null;
  minC: number | null;
  maxF: number | null;
  minF: number | null;
  rainChance: number | null;
  snowChance: number | null;
  conditionText: string | null;
  conditionCode: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherAlert {
  headline: string | null;
  event: string | null;
  severity: string | null;
  areas: string | null;
  effective: string | null;
  expires: string | null;
  desc: string | null;
  instruction: string | null;
}

// Fields added with the forecast are null on a row saved before the upgrade,
// or when the field is switched off on the WeatherAPI account.
export interface Weather extends Model {
  externalLastUpdate: string;
  tempC: number;
  tempF: number;
  feelsLikeC: number | null;
  feelsLikeF: number | null;
  isDay: number;
  cloud: number;
  conditionText: string;
  conditionCode: number;
  humidity: number;
  windK: number;
  windM: number;
  windDir: string | null;
  gustK: number | null;
  gustM: number | null;
  uv: number | null;
  precipMm: number | null;
  precipIn: number | null;
  pressureMb: number | null;
  pressureIn: number | null;
  visKm: number | null;
  visM: number | null;
  aqi: number | null;
  locationName: string | null;
  forecast: WeatherForecastDay[];
  alerts: WeatherAlert[];
}
