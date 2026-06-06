import { WeatherData } from '../types';

export interface Config {
  WEATHER_API_KEY: string;
  lat: number;
  long: number;
  isCelsius: boolean;
  customTitle: string;
  pinAppsByDefault: boolean;
  pinCategoriesByDefault: boolean;
  hideHeader: boolean;
  useOrdering: string;
  appsSameTab: boolean;
  bookmarksSameTab: boolean;
  searchSameTab: boolean;
  hideApps: boolean;
  hideCategories: boolean;
  hideSearch: boolean;
  defaultSearchProvider: string;
  secondarySearchProvider: string;
  dockerApps: boolean;
  dockerHost: string;
  kubernetesApps: boolean;
  unpinStoppedApps: boolean;
  useAmericanDate: boolean;
  disableAutofocus: boolean;
  greetingsSchema: string;
  daySchema: string;
  monthSchema: string;
  showTime: boolean;
  defaultTheme: string;
  isKilometer: boolean;
  weatherData: WeatherData;
  hideDate: boolean;
  // Auto-update / "About" settings. Persisted in config.json (added to
  // initialConfig.json so updateConfig's allow-list accepts them).
  automaticUpdates: boolean;
  useDefaults: boolean;
  updateUrl: string;
  showPopups: boolean;
  // Seconds between app health-check probes (server-side).
  statusCheckInterval: number;
  // Percentage of the page width the dashboard fills on large screens
  // (>= 1201px). Applied via the --dashboard-width CSS variable.
  dashboardWidth: number;
  // Number of columns for the apps / bookmarks grids on large screens
  // (>= 900px). Narrower breakpoints ramp down, capped at these values.
  appsColumns: number;
  bookmarksColumns: number;
}
