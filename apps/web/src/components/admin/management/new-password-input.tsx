'use client';

import { PASSWORD_MIN_LENGTH } from '@vitruv/shared';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';

/** Easy-to-say words for generated passwords (no look-alike letters, no umlauts). */
const WORDS = [
  'berg',
  'fluss',
  'kraft',
  'sonne',
  'welle',
  'stein',
  'adler',
  'linde',
  'wolke',
  'feder',
  'tiger',
  'blitz',
  'garten',
  'hafen',
  'insel',
  'kompass',
  'laterne',
  'mond',
  'nebel',
  'ozean',
  'palme',
  'regen',
  'sturm',
  'turm',
  'vogel',
  'wald',
  'zeder',
  'anker',
  'brise',
  'falke',
];

/** e.g. "Sonne-Anker-47-Wald" — 4 parts from a CSPRNG, ≥ 12 characters, easy to dictate. */
export function suggestPassword() {
  const pick = new Uint32Array(4);
  crypto.getRandomValues(pick);
  const word = (n: number) => {
    const w = WORDS[n % WORDS.length] ?? 'kraft';
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  return `${word(pick[0] ?? 0)}-${word(pick[1] ?? 0)}-${10 + ((pick[2] ?? 0) % 90)}-${word(pick[3] ?? 0)}`;
}

/**
 * Password the coach sets for a client (told to the client in person): show/hide toggle and a
 * "Vorschlag" button that fills a random, easy-to-say password. Uncontrolled for server-action
 * forms (name="password"); never stored or logged in the browser.
 */
export function NewPasswordInput({
  id,
  describedBy,
  invalid,
  name = 'password',
}: {
  id: string;
  describedBy?: string;
  invalid?: true;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="vt-pw min-w-0 flex-1">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={256}
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className="vt-input type-body"
        />
        <button
          type="button"
          className="vt-pw__toggle"
          aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'}
          aria-pressed={show}
          aria-controls={id}
          onClick={() => setShow((v) => !v)}
        >
          {show ? (
            <EyeOff aria-hidden className="size-5" />
          ) : (
            <Eye aria-hidden className="size-5" />
          )}
        </button>
      </div>
      <Button
        type="button"
        variant="secondary"
        icon={<Wand2 />}
        onClick={() => {
          setValue(suggestPassword());
          setShow(true);
        }}
      >
        Vorschlag
      </Button>
    </div>
  );
}
