'use client';

import { useSyncExternalStore } from 'react';

/** Greeting for a local hour (0–23): morning 5–10, day 11–17, evening otherwise. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Guten Morgen';
  if (hour >= 11 && hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

const noop = () => () => undefined;

/**
 * "👋 Guten Morgen, Vorname Nachname" — the time of day comes from the VIEWER's clock (client
 * only), so the server renders a neutral "Hallo" and the browser swaps in the right greeting
 * without a hydration mismatch. The hand waves once on arrival (static under reduced motion).
 */
export function Greeting({ name }: { name: string }) {
  const word = useSyncExternalStore(
    noop,
    () => greetingFor(new Date().getHours()),
    () => 'Hallo',
  );
  const today = useSyncExternalStore(
    noop,
    () =>
      new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(),
      ),
    () => '',
  );
  return (
    <div className="vt-greet">
      <p className="vt-greet__date type-eyebrow text-accent-text" aria-hidden={!today}>
        {today || ' '}
      </p>
      <h1 className="vt-greet__title">
        <span aria-hidden className="vt-greet__hand">
          👋
        </span>{' '}
        <span className="vt-greet__word">
          {word}
          {name ? ',' : ''}
        </span>
        {name && (
          <>
            {' '}
            <em className="vt-greet__name">{name}</em>
          </>
        )}
      </h1>
    </div>
  );
}
