'use client';

import { Check, Copy, KeyRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { formatDateTime } from './labels';

/**
 * Shows a freshly issued activation link ONCE. It lives only in this component's memory: never
 * written to localStorage/sessionStorage, the URL, analytics or logs, and the server can not
 * show it again (only its hash is stored). Leaving the page discards it.
 */
export function ActivationLinkPanel({
  url,
  expiresAt,
  personName,
}: {
  url: string;
  expiresAt: string;
  personName: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-xs border border-accent p-5"
    >
      <h2
        id={`${id}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="type-title flex items-center gap-2"
      >
        <KeyRound aria-hidden className="size-5 text-accent-text" />
        Aktivierungslink für {personName}
      </h2>
      <p className="type-body-sm text-fg-muted">
        <strong className="text-fg">Nur jetzt sichtbar:</strong> Der Link kann später nicht erneut
        angezeigt werden. Gib ihn persönlich und sicher weiter (z. B. Messenger oder Telefon) – die
        Person legt damit ihr eigenes Passwort fest. Gültig bis {formatDateTime(expiresAt)}, nur
        einmal verwendbar.
      </p>
      <label htmlFor={`${id}-url`} className="type-body-sm font-semibold">
        Aktivierungslink
      </label>
      <input
        id={`${id}-url`}
        readOnly
        value={url}
        className="vt-input type-body-sm font-mono"
        onFocus={(event) => event.currentTarget.select()}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={copied === 'done' ? <Check aria-hidden /> : <Copy aria-hidden />}
          onClick={copy}
          aria-describedby={`${id}-copy-status`}
        >
          Link kopieren
        </Button>
        <p
          id={`${id}-copy-status`}
          role="status"
          aria-live="polite"
          className="type-body-sm text-fg-muted"
        >
          {copied === 'done'
            ? 'Link in die Zwischenablage kopiert.'
            : copied === 'failed'
              ? 'Kopieren nicht möglich – bitte den Link im Feld markieren und kopieren.'
              : ''}
        </p>
      </div>
    </section>
  );
}
