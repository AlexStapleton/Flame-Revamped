import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { Skycons } from 'skycons-ts';
import { State } from '../../../../store/reducers';
import { IconMapping, TimeOfDay } from './IconMapping';

interface Props {
  weatherStatusCode: number;
  isDay: number;
}

export const WeatherIcon = (props: Props): JSX.Element => {
  const { activeTheme } = useSelector((state: State) => state.theme);

  const icon = props.isDay
    ? new IconMapping().mapIcon(props.weatherStatusCode, TimeOfDay.day)
    : new IconMapping().mapIcon(props.weatherStatusCode, TimeOfDay.night);

  useEffect(() => {
    let cancelled = false;
    let skycons: Skycons | undefined;

    // skycons-ts is only needed once the widget renders an icon, so it is
    // loaded on demand. The canvas below is the same-size placeholder.
    const delay = setTimeout(() => {
      import('skycons-ts')
        .then(({ Skycons }) => {
          if (cancelled) return;
          skycons = new Skycons({ color: activeTheme.colors.accent });
          skycons.add(`weather-icon`, icon);
          skycons.play();
        })
        .catch(() => undefined);
    }, 1);

    return () => {
      cancelled = true;
      clearTimeout(delay);
    };
  }, [props.weatherStatusCode, icon, activeTheme.colors.accent]);

  return <canvas id={`weather-icon`} width="50" height="50"></canvas>;
};
