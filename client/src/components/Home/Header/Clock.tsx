import { memo } from 'react';
import { useTicker } from '../../../hooks/useTicker';
import { getDateTime } from './functions/getDateTime';
import { greeter } from './functions/greeter';

// The date/time line and the greeting own their timers, so a tick re-renders
// only these small components and not the whole header (weather, Pi-hole,
// calendar).
function DateTimeLine(): JSX.Element {
  const dateTime = useTicker(getDateTime, 1000);
  return <p>{dateTime}</p>;
}

function GreetingLine(): JSX.Element {
  // The greeting only changes on the hour.
  const greeting = useTicker(greeter, 30 * 1000);
  return <h1>{greeting}</h1>;
}

export const DateTime = memo(DateTimeLine);
export const Greeting = memo(GreetingLine);
