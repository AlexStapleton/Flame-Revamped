import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { Skycons } from 'skycons-ts';
import { State } from '../../../../store/reducers';
import { IconMapping, TimeOfDay } from './IconMapping';

interface Props {
  weatherStatusCode: number;
  isDay: number;
  // Canvas size in px (default 50).
  size?: number;
  // Animated icons redraw every frame; the forecast strip uses still ones.
  animate?: boolean;
}

export const WeatherIcon = (props: Props): JSX.Element => {
  const { activeTheme } = useSelector((state: State) => state.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { size = 50, animate = true } = props;

  const icon = props.isDay
    ? new IconMapping().mapIcon(props.weatherStatusCode, TimeOfDay.day)
    : new IconMapping().mapIcon(props.weatherStatusCode, TimeOfDay.night);

  useEffect(() => {
    let cancelled = false;
    let skycons: Skycons | undefined;
    const canvas = canvasRef.current;

    // skycons-ts is only needed once the widget renders an icon, so it is
    // loaded on demand. The canvas below is the same-size placeholder.
    const delay = setTimeout(() => {
      import('skycons-ts')
        .then(({ Skycons }) => {
          if (cancelled || !canvas) return;
          skycons = new Skycons({ color: activeTheme.colors.accent });
          // add() draws one still frame; play() animates it.
          skycons.add(canvas, icon);
          if (animate) skycons.play();
        })
        .catch(() => undefined);
    }, 1);

    // Stop this instance's animation loop. Without this, every condition or
    // theme change left the previous loop running and drawing its old icon
    // onto the same canvas, so two icons flickered over each other.
    return () => {
      cancelled = true;
      clearTimeout(delay);
      if (skycons) {
        skycons.pause();
        if (canvas) skycons.remove(canvas);
      }
    };
  }, [icon, animate, activeTheme.colors.accent]);

  return <canvas ref={canvasRef} width={size} height={size}></canvas>;
};
