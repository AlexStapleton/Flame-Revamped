import {
  DockerSettingsForm,
  UISettingsForm,
  GeneralForm,
  ThemeSettingsForm,
  WeatherForm,
  PiholeForm,
  CalendarForm,
} from '../interfaces';

export type ConfigFormData =
  | WeatherForm
  | PiholeForm
  | CalendarForm
  | GeneralForm
  | DockerSettingsForm
  | UISettingsForm
  | ThemeSettingsForm;
