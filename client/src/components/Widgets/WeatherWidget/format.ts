import { Weather, WeatherAlert, WeatherForecastDay } from '../../../interfaces';
import { WeatherData } from '../../../types';

export interface Units {
  isCelsius: boolean;
  isKilometer: boolean;
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

// Both units are rounded to whole degrees (°C used to show decimals while °F
// was rounded).
export const temp = (c: number | null, f: number | null, u: Units): string => {
  const v = u.isCelsius ? c : f;
  return isNum(v) ? `${Math.round(v)}°` : '–';
};

export const tempWithUnit = (w: Weather, u: Units): string =>
  `${temp(w.tempC, w.tempF, u)}${u.isCelsius ? 'C' : 'F'}`;

// US EPA index from WeatherAPI, 1 (good) to 6 (hazardous).
const AQI_LABELS = [
  'Good',
  'Moderate',
  'Unhealthy for sensitive groups',
  'Unhealthy',
  'Very unhealthy',
  'Hazardous',
];
export const aqiLabel = (aqi: number | null): string | null =>
  isNum(aqi) && aqi >= 1 && aqi <= 6 ? AQI_LABELS[aqi - 1] : null;

export const wind = (w: Weather, u: Units): string | null => {
  const speed = u.isKilometer ? w.windK : w.windM;
  if (!isNum(speed)) return null;
  const unit = u.isKilometer ? 'km/h' : 'mph';
  return `${Math.round(speed)} ${unit}${w.windDir ? ` ${w.windDir}` : ''}`;
};

export const gust = (w: Weather, u: Units): string | null => {
  const g = u.isKilometer ? w.gustK : w.gustM;
  return isNum(g) ? `${Math.round(g)} ${u.isKilometer ? 'km/h' : 'mph'}` : null;
};

export const pressure = (w: Weather, u: Units): string | null => {
  if (u.isKilometer) {
    return isNum(w.pressureMb) ? `${Math.round(w.pressureMb)} hPa` : null;
  }
  return isNum(w.pressureIn) ? `${w.pressureIn.toFixed(2)} inHg` : null;
};

export const precip = (w: Weather, u: Units): string | null => {
  if (u.isKilometer) return isNum(w.precipMm) ? `${w.precipMm} mm` : null;
  return isNum(w.precipIn) ? `${w.precipIn} in` : null;
};

export const visibility = (w: Weather, u: Units): string | null => {
  const v = u.isKilometer ? w.visKm : w.visM;
  return isNum(v) ? `${v} ${u.isKilometer ? 'km' : 'mi'}` : null;
};

const pct = (v: number | null | undefined): string | null =>
  isNum(v) ? `${Math.round(v)}%` : null;

// The configurable stat next to today's high and low: [value, label].
export const stat = (
  key: WeatherData,
  w: Weather,
  today: WeatherForecastDay | undefined,
  u: Units
): [string, string] | null => {
  const pick = (): [string | null, string] => {
    switch (key) {
      case 'humidity':
        return [pct(w.humidity), 'Humidity'];
      case 'rain':
        return [pct(today?.rainChance), 'Chance of rain today'];
      case 'precip':
        return [precip(w, u), 'Rain in the last hour'];
      case 'wind':
        return [wind(w, u), 'Wind'];
      case 'uv':
        return [isNum(w.uv) ? `UV ${w.uv}` : null, 'UV index'];
      case 'aqi': {
        const label = aqiLabel(w.aqi);
        return [label ? `AQI ${w.aqi}` : null, `Air quality: ${label}`];
      }
      case 'pressure':
        return [pressure(w, u), 'Pressure'];
      case 'visibility':
        return [visibility(w, u), 'Visibility'];
      case 'cloud':
      default:
        return [pct(w.cloud), 'Cloud coverage'];
    }
  };
  const [value, label] = pick();
  return value ? [value, label] : null;
};

// 'Today', then short day names from the date schema in settings.
export const dayLabel = (date: string | null, index: number): string => {
  if (index === 0) return 'Today';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = localStorage.getItem('daySchema')?.split(';') || [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return (days[d.getDay()] || '').slice(0, 3);
};

// Alerts still in effect. One with no readable expiry is kept; the server
// replaces the list every 15 minutes anyway.
export const activeAlerts = (
  alerts: WeatherAlert[] | undefined,
  now = Date.now()
): WeatherAlert[] =>
  (alerts || []).filter((a) => {
    const t = a.expires ? Date.parse(a.expires) : NaN;
    return Number.isNaN(t) || t > now;
  });

export const alertTime = (iso: string | null): string | null => {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
