import {
  DockerSettingsForm,
  UISettingsForm,
  GeneralForm,
  ThemeSettingsForm,
  WeatherForm,
  PiholeForm,
} from '../interfaces';

export type ConfigFormData =
  | WeatherForm
  | PiholeForm
  | GeneralForm
  | DockerSettingsForm
  | UISettingsForm
  | ThemeSettingsForm;
